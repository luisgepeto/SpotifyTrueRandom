import { getCurrentPlayback, getDevices } from './spotify.js';
import { generateBatch, queueBatch, enqueueBatch } from './queueManager.js';
import { saveLastQueuedPlaylist } from './storage.js';

/**
 * Start TrueRandom: replaces current playback context with a new batch.
 */
export async function startTrueRandom(playlistId, tracks, onProgress) {
  const deviceId = await getActiveDeviceId();

  const batch = await generateBatch(tracks);
  if (batch.length === 0) throw new Error('No tracks available to queue.');

  await queueBatch(batch, deviceId, onProgress);
  saveLastQueuedPlaylist(playlistId);

  return { batch };
}

/**
 * Enqueue TrueRandom: appends songs to the existing Spotify queue.
 * Does NOT interrupt current playback.
 */
export async function addToTrueRandomQueue(playlistId, tracks, onProgress) {
  const deviceId = await getActiveDeviceId();

  const batch = await generateBatch(tracks);
  if (batch.length === 0) throw new Error('No tracks available to queue.');

  await enqueueBatch(batch, deviceId, onProgress);
  saveLastQueuedPlaylist(playlistId);

  return { batch };
}

/**
 * Check if Spotify is currently playing something.
 */
export async function checkIsPlaying() {
  try {
    const playback = await getCurrentPlayback();
    return playback?.is_playing === true;
  } catch {
    return false;
  }
}

async function getActiveDeviceId() {
  const devices = await getDevices();
  if (devices.length === 0) {
    throw new Error('No active Spotify device found. Open Spotify on your phone or computer.');
  }
  const activeDevice = devices.find((d) => d.is_active) || devices[0];
  return activeDevice.id;
}
