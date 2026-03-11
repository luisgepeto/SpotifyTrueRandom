import { getCurrentPlayback, getDevices } from './spotify.js';
import { generateBatch, queueBatch, enqueueBatch } from './queueManager.js';
import { saveLastQueuedPlaylist } from './storage.js';

/**
 * Enqueue TrueRandom songs for a playlist.
 * - If nothing is playing: plays the first song + queues the rest.
 * - If music is already playing: adds all songs to queue without interrupting.
 * Returns the generated batch.
 */
export async function enqueueTrueRandom(playlistId, tracks, onProgress) {
  const devices = await getDevices();
  if (devices.length === 0) {
    throw new Error('No active Spotify device found. Open Spotify on your phone or computer.');
  }
  const activeDevice = devices.find((d) => d.is_active) || devices[0];
  const deviceId = activeDevice.id;

  const batch = generateBatch(tracks);
  if (batch.length === 0) {
    throw new Error('No tracks available to queue.');
  }

  // Check current playback to decide behavior
  const playback = await getCurrentPlayback();
  const isPlaying = playback?.is_playing === true;

  if (isPlaying) {
    await enqueueBatch(batch, deviceId, onProgress);
  } else {
    await queueBatch(batch, deviceId, onProgress);
  }

  saveLastQueuedPlaylist(playlistId);

  return { batch, startedPlayback: !isPlaying };
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
