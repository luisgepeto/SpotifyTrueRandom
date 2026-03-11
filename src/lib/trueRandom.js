import { getPlaylistStats, savePlaylistStats, getDebugMode } from './storage.js';

export function selectNextTrack(playlistId, tracks, { recordPlay = true } = {}) {
  if (!tracks || tracks.length === 0) return null;

  const stats = getPlaylistStats(playlistId);
  const tolerance = stats.tolerance || 10;
  const debugMode = getDebugMode();

  // Sync stats with current playlist tracks
  const activeCounts = [];
  for (const track of tracks) {
    if (stats.tracks[track.id] !== undefined) {
      activeCounts.push(stats.tracks[track.id].playCount);
    }
  }

  const average = activeCounts.length > 0
    ? activeCounts.reduce((a, b) => a + b, 0) / activeCounts.length
    : 0;

  // Initialize new tracks to average
  for (const track of tracks) {
    if (stats.tracks[track.id] === undefined) {
      stats.tracks[track.id] = {
        playCount: Math.round(average),
        name: track.name,
        artist: track.artist,
      };
    } else {
      // Update cached metadata
      stats.tracks[track.id].name = track.name;
      stats.tracks[track.id].artist = track.artist;
    }
  }

  const threshold = average + tolerance;

  // Build candidates
  const candidates = [];
  const allTrackData = [];

  for (const track of tracks) {
    const count = stats.tracks[track.id].playCount;
    const weight = Math.max(threshold - count, 0);
    const isCandidate = count < threshold;

    allTrackData.push({
      track,
      count,
      weight: isCandidate ? weight : 0,
      isCandidate,
    });

    if (isCandidate && weight > 0) {
      candidates.push({ track, weight });
    }
  }

  // Fallback: if no candidates, pick the track with lowest count
  let selected;
  if (candidates.length === 0) {
    const minCount = Math.min(...tracks.map((t) => stats.tracks[t.id].playCount));
    const fallbackCandidates = tracks.filter((t) => stats.tracks[t.id].playCount === minCount);
    selected = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
  } else {
    // Weighted random selection
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;
    for (const candidate of candidates) {
      random -= candidate.weight;
      if (random <= 0) {
        selected = candidate.track;
        break;
      }
    }
    if (!selected) selected = candidates[candidates.length - 1].track;
  }

  // Debug logging
  if (debugMode) {
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    console.group(
      `%c[TrueRandom Debug] Playlist: "${playlistId}"`,
      'color: #1DB954; font-weight: bold;'
    );
    console.log(`Promedio: ${average.toFixed(1)} | Tolerancia: ${tolerance} | Umbral: ${threshold.toFixed(1)}`);
    console.table(
      allTrackData.map((d) => ({
        Canción: `${d.track.name} - ${d.track.artist}`,
        Conteo: d.count,
        Peso: d.isCandidate ? d.weight.toFixed(1) : '-',
        Probabilidad: d.isCandidate && totalWeight > 0
          ? `${((d.weight / totalWeight) * 100).toFixed(1)}%`
          : '-',
        Estado: d.isCandidate ? 'candidata' : 'EXCLUIDA',
      }))
    );
    console.log(
      `%c► Seleccionada: ${selected.name} (conteo: ${stats.tracks[selected.id].playCount} → ${stats.tracks[selected.id].playCount + 1})`,
      'color: #1DB954; font-weight: bold;'
    );
    console.groupEnd();
  }

  // Increment play count
  if (recordPlay) {
    stats.tracks[selected.id].playCount += 1;
    savePlaylistStats(playlistId, stats);
  }

  return selected;
}

export function getTrackStats(playlistId, tracks) {
  const stats = getPlaylistStats(playlistId);

  const trackStats = tracks.map((track) => {
    const data = stats.tracks[track.id];
    return {
      ...track,
      playCount: data?.playCount ?? 0,
    };
  });

  const counts = trackStats.map((t) => t.playCount);
  const average = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const min = counts.length > 0 ? Math.min(...counts) : 0;
  const max = counts.length > 0 ? Math.max(...counts) : 0;

  return {
    tracks: trackStats,
    average,
    min,
    max,
    tolerance: stats.tolerance || 10,
  };
}
