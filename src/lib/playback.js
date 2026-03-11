import { getCurrentPlayback, playTrack, addToQueue } from './spotify.js';
import { selectNextTrack } from './trueRandom.js';
import { getPlaylistStats, savePlaylistStats, getQueueSize } from './storage.js';
import { getValidToken } from './auth.js';

let pollingInterval = null;
let currentPlaylistId = null;
let currentTracks = null;
let currentTrackUri = null;
let currentDeviceId = null;
let onTrackChangeCallback = null;
let isActive = false;
let trackHistory = [];
let wasPlaying = false;
let playingNextLock = false;
// Ordered list of tracks we have pre-queued with Spotify (not yet confirmed played).
let pendingQueuedTracks = [];

function handleVisibilityChange() {
  if (!isActive) return;

  if (document.visibilityState === 'hidden') {
    // Stop polling while the page is hidden to avoid throttled/unreliable timers
    stopPolling();
  } else if (document.visibilityState === 'visible' && currentDeviceId) {
    // Page became visible again (device unlocked / app foregrounded)
    console.log('[TrueRandom] Page became visible, checking playback state');
    checkAndResumePlayback();
  }
}

async function checkAndResumePlayback() {
  if (!isActive || playingNextLock) return;

  try {
    const playback = await getCurrentPlayback();

    // No playback state — all queued tracks finished while device was locked
    if (!playback || !playback.item) {
      if (wasPlaying) {
        console.log('[TrueRandom] Playback stopped while device was locked, playing next');
        wasPlaying = false;
        playNextTrack(currentDeviceId);
      }
      return;
    }

    const currentUri = playback.item.uri;
    const isPlaying = playback.is_playing;

    if (currentUri !== currentTrackUri) {
      const queueIndex = pendingQueuedTracks.findIndex((t) => t.uri === currentUri);
      if (queueIndex !== -1) {
        // Spotify naturally advanced through one or more queued tracks while locked
        console.log('[TrueRandom] Spotify advanced through queued tracks while device was locked');
        await advanceToQueuedTracks(queueIndex);
      } else {
        console.log('[TrueRandom] Track changed while device was locked, playing next');
        playNextTrack(currentDeviceId);
      }
      return;
    }

    // Same track — update state and restart polling
    wasPlaying = isPlaying;
    startPolling(currentDeviceId);
  } catch (error) {
    console.error('[TrueRandom] Error checking playback on visibility change:', error);
    if (!getValidToken()) {
      stopPlayback();
    }
  }
}

// Called when Spotify has naturally advanced to pendingQueuedTracks[targetIndex].
// Records play counts for all tracks up to and including that index, updates
// internal state, and refills the queue.
async function advanceToQueuedTracks(targetIndex) {
  const nowPlaying = pendingQueuedTracks[targetIndex];

  const stats = getPlaylistStats(currentPlaylistId);
  for (let i = 0; i <= targetIndex; i++) {
    const t = pendingQueuedTracks[i];
    if (stats.tracks[t.id] !== undefined) {
      stats.tracks[t.id].playCount += 1;
    }
    trackHistory.push(t);
  }
  savePlaylistStats(currentPlaylistId, stats);

  pendingQueuedTracks.splice(0, targetIndex + 1);
  currentTrackUri = nowPlaying.uri;
  wasPlaying = true;

  if (onTrackChangeCallback) onTrackChangeCallback(nowPlaying);

  await fillQueue();
  startPolling(currentDeviceId);
}

// Select the next N tracks (without recording plays) and add them to Spotify's
// queue so playback continues automatically even when the screen is locked.
// Uses virtualCounts so consecutive selections favour different tracks.
// Queue size is read on each call so live setting changes take effect immediately.
async function fillQueue() {
  if (!isActive || !currentTracks || currentTracks.length === 0) return;

  const needed = getQueueSize() - pendingQueuedTracks.length;
  if (needed <= 0) return;

  // Seed virtual counts from tracks already pending so we don't repeat them
  const virtualCounts = {};
  for (const qt of pendingQueuedTracks) {
    virtualCounts[qt.id] = (virtualCounts[qt.id] || 0) + 1;
  }

  for (let i = 0; i < needed; i++) {
    if (!isActive) break;

    const nextTrack = selectNextTrack(currentPlaylistId, currentTracks, {
      recordPlay: false,
      virtualCounts,
    });
    if (!nextTrack) break;

    // Increment virtual count so the next iteration picks a different track
    virtualCounts[nextTrack.id] = (virtualCounts[nextTrack.id] || 0) + 1;

    if (!isActive) break;
    try {
      await addToQueue(nextTrack.uri, currentDeviceId);
      pendingQueuedTracks.push(nextTrack);
      console.log('[TrueRandom] Queued:', nextTrack.name);
    } catch (err) {
      console.error('[TrueRandom] Error queuing track:', err);
      break;
    }
  }
}

export function startTrueRandomPlayback(playlistId, tracks, deviceId, onTrackChange) {
  stopPlayback();

  currentPlaylistId = playlistId;
  currentTracks = tracks;
  currentDeviceId = deviceId;
  onTrackChangeCallback = onTrackChange;
  isActive = true;
  trackHistory = [];
  wasPlaying = false;
  playingNextLock = false;
  pendingQueuedTracks = [];

  document.addEventListener('visibilitychange', handleVisibilityChange);

  playNextTrack(deviceId);
}

async function playNextTrack(deviceId) {
  if (!isActive || !currentTracks || currentTracks.length === 0) return;
  if (playingNextLock) return;
  playingNextLock = true;
  // Discard any queued tracks — playTrack() with uris resets Spotify's context
  pendingQueuedTracks = [];

  const nextTrack = selectNextTrack(currentPlaylistId, currentTracks);
  if (!nextTrack) {
    playingNextLock = false;
    return;
  }

  currentTrackUri = nextTrack.uri;
  trackHistory.push(nextTrack);

  try {
    await playTrack(nextTrack.uri, deviceId);
    wasPlaying = true;
    if (onTrackChangeCallback) {
      onTrackChangeCallback(nextTrack);
    }
    startPolling(deviceId);
    // Pre-fill Spotify's queue so playback continues while the device is locked
    fillQueue();
  } catch (error) {
    console.error('[TrueRandom] Error playing track:', error);
  } finally {
    playingNextLock = false;
  }
}

export function previousTrack(deviceId) {
  if (!isActive || trackHistory.length < 2) return;

  const prevTrack = trackHistory[trackHistory.length - 2];

  const stats = getPlaylistStats(currentPlaylistId);
  if (stats.tracks[prevTrack.id]) {
    stats.tracks[prevTrack.id].playCount += 1;
    savePlaylistStats(currentPlaylistId, stats);
  }

  trackHistory.push(prevTrack);
  currentTrackUri = prevTrack.uri;
  pendingQueuedTracks = [];

  playTrack(prevTrack.uri, deviceId)
    .then(() => {
      wasPlaying = true;
      if (onTrackChangeCallback) onTrackChangeCallback(prevTrack);
      startPolling(deviceId);
      fillQueue();
    })
    .catch((err) => console.error('[TrueRandom] Error playing previous track:', err));
}

function startPolling(deviceId) {
  stopPolling();

  pollingInterval = setInterval(async () => {
    if (!isActive) {
      stopPolling();
      return;
    }

    try {
      const playback = await getCurrentPlayback();

      // No playback state at all — if we were playing, the song ended
      if (!playback || !playback.item) {
        if (wasPlaying) {
          console.log('[TrueRandom] Playback ended (no state), playing next');
          wasPlaying = false;
          playNextTrack(deviceId);
        }
        return;
      }

      const currentUri = playback.item.uri;
      const isPlaying = playback.is_playing;
      const progressMs = playback.progress_ms;
      const durationMs = playback.item.duration_ms;

      // Song ended: was playing, now stopped, same track, and near the end
      if (!isPlaying && wasPlaying && currentUri === currentTrackUri && durationMs - progressMs < 3000) {
        console.log('[TrueRandom] Song finished, playing next');
        wasPlaying = false;
        playNextTrack(deviceId);
        return;
      }

      // Track changed — check if Spotify naturally advanced through our queue
      if (currentUri !== currentTrackUri) {
        const queueIndex = pendingQueuedTracks.findIndex((t) => t.uri === currentUri);
        if (queueIndex !== -1) {
          console.log('[TrueRandom] Spotify advanced to queued track');
          await advanceToQueuedTracks(queueIndex);
        } else {
          console.log('[TrueRandom] Track changed externally, playing next');
          playNextTrack(deviceId);
        }
        return;
      }

      // Update playing state
      wasPlaying = isPlaying;
    } catch {
      if (!getValidToken()) {
        stopPlayback();
      }
    }
  }, 2000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

export function stopPlayback() {
  isActive = false;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  stopPolling();
  currentPlaylistId = null;
  currentTracks = null;
  currentTrackUri = null;
  currentDeviceId = null;
  onTrackChangeCallback = null;
  trackHistory = [];
  wasPlaying = false;
  playingNextLock = false;
  pendingQueuedTracks = [];
}

export function skipTrack(deviceId) {
  if (!isActive) return;
  playNextTrack(deviceId);
}

export function isPlaybackActive() {
  return isActive;
}

export function getCurrentPlaylistId() {
  return currentPlaylistId;
}
