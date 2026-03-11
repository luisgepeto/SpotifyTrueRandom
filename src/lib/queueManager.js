import { addToQueue, playTrack } from './spotify.js';
import { getGlobalStats, getGlobalTolerance, getDebugMode } from './storage.js';

const BATCH_SIZE = 30;
const QUEUE_DELAY_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a TrueRandom-ordered batch of tracks using global stats.
 * Does NOT modify global stats — simulation only.
 */
export function generateBatch(tracks, batchSize = BATCH_SIZE) {
  if (!tracks || tracks.length === 0) return [];

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

  // Build simulation counts — new tracks start at average for fair weighting,
  // but this is NOT persisted to global stats
  const simCounts = {};
  for (const track of tracks) {
    simCounts[track.id] = stats.tracks[track.id]?.playCount ?? Math.round(average);
  }

  const batch = [];
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
    console.log(`[TrueRandom] Generated batch of ${batch.length} songs`);
    console.log(batch.map((t, i) => `  ${i + 1}. ${t.name} - ${t.artist}`).join('\n'));
  }

  return batch;
}

/**
 * Start playback with a batch: plays the first song, then adds the rest to queue.
 * Used when no music is currently playing.
 * Note: Spotify has no API to clear the queue. Previously queued items will play
 * after the current song before our queued tracks.
 */
export async function queueBatch(batch, deviceId, onProgress) {
  if (batch.length === 0) return;

  await playTrack(batch[0].uri, deviceId);
  if (onProgress) onProgress(1, batch.length);

  for (let i = 1; i < batch.length; i++) {
    await sleep(QUEUE_DELAY_MS);
    try {
      await addToQueue(batch[i].uri, deviceId);
    } catch (err) {
      console.error(`[TrueRandom] Failed to queue track ${i + 1}/${batch.length}: ${batch[i].name}`, err);
    }
    if (onProgress) onProgress(i + 1, batch.length);
  }
}

/**
 * Enqueue a batch: add ALL songs to Spotify's queue without interrupting current playback.
 * Used when music is already playing.
 */
export async function enqueueBatch(batch, deviceId, onProgress) {
  if (batch.length === 0) return;

  for (let i = 0; i < batch.length; i++) {
    try {
      await addToQueue(batch[i].uri, deviceId);
    } catch (err) {
      console.error(`[TrueRandom] Failed to queue track ${i + 1}/${batch.length}: ${batch[i].name}`, err);
    }
    if (onProgress) onProgress(i + 1, batch.length);
    if (i < batch.length - 1) await sleep(QUEUE_DELAY_MS);
  }
}

export { BATCH_SIZE };
