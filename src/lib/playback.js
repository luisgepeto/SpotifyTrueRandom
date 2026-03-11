import { getCurrentPlayback, playTrack, addToQueue } from './spotify.js';
import { selectNextTrack } from './trueRandom.js';
import { getPlaylistStats, savePlaylistStats } from './storage.js';
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
let pendingQueuedTrack = null;

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

    // No playback state — track ended while device was locked
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

    // Check if Spotify naturally advanced to our pre-queued track while device was locked
    if (currentUri !== currentTrackUri) {
      if (pendingQueuedTrack && currentUri === pendingQueuedTrack.uri) {
        console.log('[TrueRandom] Spotify advanced to queued track while device was locked');
        await advanceToQueuedTrack(pendingQueuedTrack);
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

// Called when Spotify naturally advances to the track we pre-queued.
// Records its play count and queues the track after it.
async function advanceToQueuedTrack(track) {
  const stats = getPlaylistStats(currentPlaylistId);
  if (stats.tracks[track.id] !== undefined) {
    stats.tracks[track.id].playCount += 1;
    savePlaylistStats(currentPlaylistId, stats);
  }

  currentTrackUri = track.uri;
  trackHistory.push(track);
  wasPlaying = true;
  pendingQueuedTrack = null;

  if (onTrackChangeCallback) onTrackChangeCallback(track);

  await queueNextTrack();
  startPolling(currentDeviceId);
}

// Peek the next TrueRandom candidate (without recording a play) and add it to
// Spotify's queue so playback continues seamlessly when the device is locked.
async function queueNextTrack() {
  if (!isActive || !currentTracks || currentTracks.length === 0) return;

  const nextTrack = selectNextTrack(currentPlaylistId, currentTracks, { recordPlay: false });
  if (!nextTrack) return;

  pendingQueuedTrack = nextTrack;
  try {
    await addToQueue(nextTrack.uri, currentDeviceId);
    console.log('[TrueRandom] Queued next track for background playback:', nextTrack.name);
  } catch (err) {
    console.error('[TrueRandom] Error queuing next track:', err);
    pendingQueuedTrack = null;
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
  pendingQueuedTrack = null;

  document.addEventListener('visibilitychange', handleVisibilityChange);

  playNextTrack(deviceId);
}

async function playNextTrack(deviceId) {
  if (!isActive || !currentTracks || currentTracks.length === 0) return;
  if (playingNextLock) return;
  playingNextLock = true;
  pendingQueuedTrack = null;

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
    // Queue the following track so Spotify can advance automatically while locked
    queueNextTrack();
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
  pendingQueuedTrack = null;

  playTrack(prevTrack.uri, deviceId)
    .then(() => {
      wasPlaying = true;
      if (onTrackChangeCallback) onTrackChangeCallback(prevTrack);
      startPolling(deviceId);
      queueNextTrack();
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

      // Track changed — check if Spotify naturally advanced to our queued track
      if (currentUri !== currentTrackUri) {
        if (pendingQueuedTrack && currentUri === pendingQueuedTrack.uri) {
          console.log('[TrueRandom] Spotify advanced to queued track');
          await advanceToQueuedTrack(pendingQueuedTrack);
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
  pendingQueuedTrack = null;
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
