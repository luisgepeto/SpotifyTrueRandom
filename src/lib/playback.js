import { getCurrentPlayback, pausePlayback, resumePlayback, addToQueue } from './spotify.js';
import { startQueueSession, getSavedQueue, saveQueue, clearSavedQueue, reconcilePlayCounts, generateBatch, queueBatch, BATCH_SIZE } from './queueManager.js';
import { getValidToken } from './auth.js';

let pollingInterval = null;
let currentPlaylistId = null;
let isActive = false;
let onStatusCallback = null;

/**
 * Start a TrueRandom queue session: generate batch, queue songs, save state.
 * onProgress: (queued, total) => void — called as songs are queued
 * onStatus: ({ currentTrack, queueRemaining }) => void — called on UI poll updates
 */
export async function startTrueRandomQueue(playlistId, tracks, deviceId, onProgress, onStatus) {
  stopSession();

  currentPlaylistId = playlistId;
  isActive = true;
  onStatusCallback = onStatus;

  const queueData = await startQueueSession(playlistId, tracks, deviceId, onProgress);

  // Notify with first track
  if (onStatus && queueData.tracks.length > 0) {
    onStatus({
      currentTrack: queueData.tracks[0],
      queueRemaining: queueData.tracks.length - 1,
    });
  }

  // Start light polling for UI updates
  startLightPolling();

  return queueData;
}

/**
 * Refill the queue with another batch of songs.
 */
export async function refillQueue(tracks, deviceId, onProgress) {
  if (!currentPlaylistId) return null;

  const batch = generateBatch(currentPlaylistId, tracks, BATCH_SIZE);
  const savedQueue = getSavedQueue();

  // Append to saved queue
  if (savedQueue) {
    savedQueue.tracks.push(...batch.map((t) => ({
      id: t.id, uri: t.uri, name: t.name, artist: t.artist, albumImage: t.albumImage,
    })));
    saveQueue(savedQueue);
  }

  // Add to Spotify queue (don't play first — just add all to queue)
  let queued = 0;
  for (const track of batch) {
    try {
      await addToQueue(track.uri, deviceId);
    } catch (err) {
      console.error(`[TrueRandom] Failed to queue: ${track.name}`, err);
    }
    queued++;
    if (onProgress) onProgress(queued, batch.length);
    await new Promise((r) => setTimeout(r, 350));
  }

  return batch;
}

/**
 * Light polling (every 30s) to update UI with current playback info.
 */
function startLightPolling() {
  stopPolling();

  pollingInterval = setInterval(async () => {
    if (!isActive) {
      stopPolling();
      return;
    }

    try {
      const playback = await getCurrentPlayback();
      if (!playback || !playback.item) return;

      if (onStatusCallback) {
        const savedQueue = getSavedQueue();
        onStatusCallback({
          currentTrack: {
            id: playback.item.id,
            name: playback.item.name,
            artist: playback.item.artists?.map((a) => a.name).join(', '),
            albumImage: playback.item.album?.images?.[0]?.url,
          },
          isPlaying: playback.is_playing,
          queueRemaining: savedQueue?.tracks?.length ?? 0,
        });
      }
    } catch {
      if (!getValidToken()) {
        stopSession();
      }
    }
  }, 30000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

export function stopSession() {
  isActive = false;
  stopPolling();
  currentPlaylistId = null;
  onStatusCallback = null;
}

/**
 * Reconcile and return results. Called when user opens the app.
 */
export async function reconcileOnReturn() {
  return reconcilePlayCounts();
}

export function isSessionActive() {
  return isActive || getSavedQueue() !== null;
}

export function getActivePlaylistId() {
  if (currentPlaylistId) return currentPlaylistId;
  const saved = getSavedQueue();
  return saved?.playlistId ?? null;
}

export function clearSession() {
  stopSession();
  clearSavedQueue();
}

/**
 * Reconnect to an existing TrueRandom session after returning to the playlist page.
 * Updates the status callback for the new component instance and resumes polling.
 * Returns true if a matching session was found, false otherwise.
 */
export function resumeSession(playlistId, onStatus) {
  const savedQueue = getSavedQueue();
  if (!savedQueue || savedQueue.playlistId !== playlistId) return false;

  currentPlaylistId = playlistId;
  isActive = true;
  onStatusCallback = onStatus;

  if (!pollingInterval) {
    startLightPolling();
  }

  return true;
}

export { pausePlayback, resumePlayback };
