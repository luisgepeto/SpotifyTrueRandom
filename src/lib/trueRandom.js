import { getGlobalStats, getGlobalTolerance, getDebugMode } from './storage.js';

export function selectNextTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;

  const stats = getGlobalStats();
  const tolerance = getGlobalTolerance();
  const debugMode = getDebugMode();

  // Get counts for tracks that already exist in global stats
  const activeCounts = [];
  for (const track of tracks) {
    if (stats.tracks[track.id] !== undefined) {
      activeCounts.push(stats.tracks[track.id].playCount);
    }
  }

  const average = activeCounts.length > 0
    ? activeCounts.reduce((a, b) => a + b, 0) / activeCounts.length
    : 0;

  // Use actual counts from global stats, defaulting new tracks to average for fair weighting
  // (not persisted — reconciliation is the only thing that updates global stats)
  const trackCounts = {};
  for (const track of tracks) {
    trackCounts[track.id] = stats.tracks[track.id]?.playCount ?? Math.round(average);
  }

  const threshold = average + tolerance;

  // Build candidates
  const candidates = [];
  const allTrackData = [];

  for (const track of tracks) {
    const count = trackCounts[track.id];
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
    const minCount = Math.min(...tracks.map((t) => trackCounts[t.id]));
    const fallbackCandidates = tracks.filter((t) => trackCounts[t.id] === minCount);
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
      '%c[TrueRandom Debug] Selection',
      'color: #1DB954; font-weight: bold;'
    );
    console.log(`Average: ${average.toFixed(1)} | Tolerance: ${tolerance} | Threshold: ${threshold.toFixed(1)}`);
    console.table(
      allTrackData.map((d) => ({
        Song: `${d.track.name} - ${d.track.artist}`,
        Count: d.count,
        Weight: d.isCandidate ? d.weight.toFixed(1) : '-',
        Probability: d.isCandidate && totalWeight > 0
          ? `${((d.weight / totalWeight) * 100).toFixed(1)}%`
          : '-',
        Status: d.isCandidate ? 'candidate' : 'EXCLUDED',
      }))
    );
    console.log(
      `%c► Selected: ${selected.name} (count: ${trackCounts[selected.id]})`,
      'color: #1DB954; font-weight: bold;'
    );
    console.groupEnd();
  }

  return selected;
}

export function getTrackStats(tracks) {
  const stats = getGlobalStats();

  const seenIds = new Set();
  const uniqueTracks = tracks.filter((track) => {
    if (seenIds.has(track.id)) return false;
    seenIds.add(track.id);
    return true;
  });

  const trackStats = uniqueTracks.map((track) => {
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
  };
}
