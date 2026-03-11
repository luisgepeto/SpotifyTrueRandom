import { addToQueue, playTrack, getRecentlyPlayed, getQueue } from './spotify.js';
import { getPlaylistStats, savePlaylistStats, getDebugMode } from './storage.js';

const BATCH_SIZE = 30;
const QUEUE_DELAY_MS = 350;
const QUEUE_STORAGE_KEY = 'truerandom_queue';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getSavedQueue() {
  const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveQueue(queueData) {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueData));
}

export function clearSavedQueue() {
  localStorage.removeItem(QUEUE_STORAGE_KEY);
}

/**
 * Generate a TrueRandom-ordered batch of tracks without modifying play counts.
 * Play counts are only updated during reconciliation (when we confirm songs were played).
 */
export function generateBatch(playlistId, tracks, batchSize = BATCH_SIZE) {
  if (!tracks || tracks.length === 0) return [];

  const stats = getPlaylistStats(playlistId);
  const tolerance = stats.tolerance || 10;
  const debugMode = getDebugMode();

  // Sync stats: get active counts and initialize new tracks
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
      stats.tracks[track.id].name = track.name;
      stats.tracks[track.id].artist = track.artist;
    }
  }

  // Save any new track initializations (but don't increment counts)
  savePlaylistStats(playlistId, stats);

  // Generate batch using simulated play counts
  const batch = [];
  // Copy counts so we can simulate without modifying storage
  const simCounts = {};
  for (const track of tracks) {
    simCounts[track.id] = stats.tracks[track.id].playCount;
  }

  for (let i = 0; i < batchSize && i < tracks.length * 2; i++) {
    const simAvg = Object.values(simCounts).reduce((a, b) => a + b, 0) / Object.keys(simCounts).length;
    const threshold = simAvg + tolerance;

    const candidates = [];
    for (const track of tracks) {
      const count = simCounts[track.id];
      const weight = Math.max(threshold - count, 0);
      if (count < threshold && weight > 0) {
        candidates.push({ track, weight });
      }
    }

    let selected;
    if (candidates.length === 0) {
      const minCount = Math.min(...tracks.map((t) => simCounts[t.id]));
      const fallbacks = tracks.filter((t) => simCounts[t.id] === minCount);
      selected = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    } else {
      const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
      let random = Math.random() * totalWeight;
      for (const c of candidates) {
        random -= c.weight;
        if (random <= 0) {
          selected = c.track;
          break;
        }
      }
      if (!selected) selected = candidates[candidates.length - 1].track;
    }

    batch.push(selected);
    simCounts[selected.id] += 1;
  }

  if (debugMode) {
    console.log(`[TrueRandom] Generated batch of ${batch.length} songs for playlist ${playlistId}`);
    console.log(batch.map((t, i) => `  ${i + 1}. ${t.name} - ${t.artist}`).join('\n'));
  }

  return batch;
}

/**
 * Queue a batch of songs into Spotify. Plays the first song, then adds rest to queue.
 * Returns progress via onProgress callback: (queued, total) => void
 */
export async function queueBatch(batch, deviceId, onProgress) {
  if (batch.length === 0) return;

  // Play the first song immediately
  await playTrack(batch[0].uri, deviceId);

  if (onProgress) onProgress(1, batch.length);

  // Add remaining songs to queue sequentially
  for (let i = 1; i < batch.length; i++) {
    await sleep(QUEUE_DELAY_MS);
    try {
      await addToQueue(batch[i].uri, deviceId);
    } catch (err) {
      console.error(`[TrueRandom] Failed to queue track ${i + 1}/${batch.length}: ${batch[i].name}`, err);
      // Continue trying remaining tracks
    }
    if (onProgress) onProgress(i + 1, batch.length);
  }
}

/**
 * Start a TrueRandom session: generate batch, queue it, save state.
 */
export async function startQueueSession(playlistId, tracks, deviceId, onProgress) {
  const batch = generateBatch(playlistId, tracks);

  const queueData = {
    playlistId,
    startedAt: Date.now(),
    tracks: batch.map((t) => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      artist: t.artist,
      albumImage: t.albumImage,
    })),
  };

  saveQueue(queueData);
  await queueBatch(batch, deviceId, onProgress);

  return queueData;
}

export { BATCH_SIZE };

/**
 * Reconcile play counts by checking recently-played tracks against our saved queue.
 * Only counts songs that were in our queue and actually appeared in recently-played.
 * Returns { reconciledCount, currentTrack, remainingInQueue }
 */
export async function reconcilePlayCounts() {
  const queueData = getSavedQueue();
  if (!queueData) return null;

  const { playlistId, tracks: queuedTracks, startedAt } = queueData;
  const debugMode = getDebugMode();

  try {
    // Fetch recently played and current queue from Spotify
    const [recentlyPlayed, currentQueue] = await Promise.all([
      getRecentlyPlayed(50),
      getQueue().catch(() => null),
    ]);

    const recentItems = recentlyPlayed?.items || [];

    // Filter recently played to only songs after our session started
    const relevantPlayed = recentItems
      .filter((item) => new Date(item.played_at).getTime() >= startedAt)
      .map((item) => item.track.id);

    // Build set of queued track IDs for this session
    const queuedIds = new Set(queuedTracks.map((t) => t.id));

    // Count how many times each queued track was played
    const playedCounts = {};
    for (const trackId of relevantPlayed) {
      if (queuedIds.has(trackId)) {
        playedCounts[trackId] = (playedCounts[trackId] || 0) + 1;
      }
    }

    // Update stats
    const stats = getPlaylistStats(playlistId);
    let reconciledCount = 0;

    for (const [trackId, count] of Object.entries(playedCounts)) {
      if (stats.tracks[trackId]) {
        stats.tracks[trackId].playCount += count;
        reconciledCount += count;
      }
    }

    if (reconciledCount > 0) {
      savePlaylistStats(playlistId, stats);
    }

    // Figure out what's still in Spotify's queue
    const currentlyPlaying = currentQueue?.currently_playing;
    const remainingQueue = currentQueue?.queue || [];

    // Update saved queue: remove tracks that already played
    const playedSet = new Set(relevantPlayed);
    const remainingTracks = queuedTracks.filter((t) => !playedSet.has(t.id));

    // Update startedAt so we don't re-count these tracks
    const updatedQueue = {
      ...queueData,
      tracks: remainingTracks,
      startedAt: Date.now(),
    };
    saveQueue(updatedQueue);

    if (debugMode) {
      console.log(`[TrueRandom] Reconciled ${reconciledCount} plays`);
      console.log(`[TrueRandom] ${remainingTracks.length} tracks remaining in saved queue`);
    }

    return {
      reconciledCount,
      currentTrack: currentlyPlaying ? {
        id: currentlyPlaying.id,
        name: currentlyPlaying.name,
        artist: currentlyPlaying.artists?.map((a) => a.name).join(', '),
        albumImage: currentlyPlaying.album?.images?.[0]?.url,
      } : null,
      remainingInQueue: remainingQueue.length,
      playlistId,
    };
  } catch (err) {
    console.error('[TrueRandom] Reconciliation error:', err);
    return null;
  }
}
