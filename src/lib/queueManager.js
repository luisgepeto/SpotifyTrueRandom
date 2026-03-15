import { addToQueue, playTrack, getQueue } from './spotify.js';

const BATCH_SIZE = 30;
const QUEUE_DELAY_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read the current Spotify queue and return a map of trackId -> count of
 * occurrences in the queue. This is the source of truth for what's pending.
 */
async function getQueueCounts() {
  try {
    const data = await getQueue();
    const counts = {};
    for (const item of data?.queue || []) {
      if (item?.id) {
        counts[item.id] = (counts[item.id] || 0) + 1;
      }
    }
    return counts;
  } catch {
    return {};
  }
}

/**
 * Generate a TrueRandom-ordered batch of tracks using server stats + current Spotify queue.
 * @param {Array} tracks - playlist tracks
 * @param {Object} stats - { tracks: { [id]: { playCount } } } from server
 * @param {number} tolerance - tolerance value from server
 * @param {number} batchSize - number of songs to generate
 */
export async function generateBatch(tracks, stats, tolerance = 10, batchSize = BATCH_SIZE) {
  if (!tracks || tracks.length === 0) return [];

  const queueCounts = await getQueueCounts();

  // Get counts for tracks that already exist in stats (real + queued)
  const activeCounts = [];
  for (const track of tracks) {
    if (stats.tracks[track.id] !== undefined) {
      activeCounts.push(stats.tracks[track.id].playCount + (queueCounts[track.id] || 0));
    }
  }

  const average = activeCounts.length > 0
    ? activeCounts.reduce((a, b) => a + b, 0) / activeCounts.length
    : 0;

  // Build simulation counts — real stats + queue counts.
  // New tracks start at average for fair weighting.
  const simCounts = {};
  for (const track of tracks) {
    const realCount = stats.tracks[track.id]?.playCount ?? Math.round(average);
    simCounts[track.id] = realCount + (queueCounts[track.id] || 0);
  }

  // Never repeat a song within a single batch
  const effectiveBatchSize = Math.min(batchSize, tracks.length);
  const batch = [];
  const usedIds = new Set();

  for (let i = 0; i < effectiveBatchSize; i++) {
    const available = tracks.filter((t) => !usedIds.has(t.id));
    if (available.length === 0) break;

    const simAvg = Object.values(simCounts).reduce((a, b) => a + b, 0) / Object.keys(simCounts).length;
    const threshold = simAvg + tolerance;

    const candidates = [];
    for (const track of available) {
      const count = simCounts[track.id];
      const weight = Math.max(threshold - count, 0);
      if (count < threshold && weight > 0) {
        candidates.push({ track, weight });
      }
    }

    let selected;
    if (candidates.length === 0) {
      const minCount = Math.min(...available.map((t) => simCounts[t.id]));
      const fallbacks = available.filter((t) => simCounts[t.id] === minCount);
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
    usedIds.add(selected.id);
    simCounts[selected.id] += 1;
  }

  return batch;
}

/**
 * Start playback with a batch: plays the first song, then adds the rest to queue.
 * Used when no music is currently playing.
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
