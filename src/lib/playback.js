import { getCurrentPlayback, playTrack } from './spotify.js';
import { selectNextTrack } from './trueRandom.js';
import { getPlaylistStats, savePlaylistStats } from './storage.js';
import { getValidToken } from './auth.js';

let pollingInterval = null;
let currentPlaylistId = null;
let currentTracks = null;
let currentTrackUri = null;
let onTrackChangeCallback = null;
let isActive = false;
let trackHistory = [];

export function startTrueRandomPlayback(playlistId, tracks, deviceId, onTrackChange) {
  stopPlayback();

  currentPlaylistId = playlistId;
  currentTracks = tracks;
  onTrackChangeCallback = onTrackChange;
  isActive = true;
  trackHistory = [];

  playNextTrack(deviceId);
}

async function playNextTrack(deviceId) {
  if (!isActive || !currentTracks || currentTracks.length === 0) return;

  const nextTrack = selectNextTrack(currentPlaylistId, currentTracks);
  if (!nextTrack) return;

  currentTrackUri = nextTrack.uri;
  trackHistory.push(nextTrack);

  try {
    await playTrack(nextTrack.uri, deviceId);
    if (onTrackChangeCallback) {
      onTrackChangeCallback(nextTrack);
    }
    startPolling(deviceId);
  } catch (error) {
    console.error('[TrueRandom] Error playing track:', error);
  }
}

export function previousTrack(deviceId) {
  if (!isActive || trackHistory.length < 2) return;

  // Current song is last in history; go back to the one before it
  const prevTrack = trackHistory[trackHistory.length - 2];

  // Increment play count for the previous track (replaying counts as a new play)
  const stats = getPlaylistStats(currentPlaylistId);
  if (stats.tracks[prevTrack.id]) {
    stats.tracks[prevTrack.id].playCount += 1;
    savePlaylistStats(currentPlaylistId, stats);
  }

  // Push it again so "previous" can keep going back
  trackHistory.push(prevTrack);
  currentTrackUri = prevTrack.uri;

  playTrack(prevTrack.uri, deviceId)
    .then(() => {
      if (onTrackChangeCallback) onTrackChangeCallback(prevTrack);
      startPolling(deviceId);
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

      if (!playback || !playback.item) return;

      // Detect track change or end
      const currentUri = playback.item.uri;
      const progressMs = playback.progress_ms;
      const durationMs = playback.item.duration_ms;

      // If Spotify moved to a different track (song ended naturally)
      // or if we're very close to the end
      if (currentUri !== currentTrackUri || (durationMs - progressMs < 3000 && !playback.is_playing)) {
        playNextTrack(deviceId);
      }
    } catch {
      // Handle polling errors gracefully - if auth expired, stop playback
      if (!getValidToken()) {
        stopPlayback();
      }
    }
  }, 3000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

export function stopPlayback() {
  isActive = false;
  stopPolling();
  currentPlaylistId = null;
  currentTracks = null;
  currentTrackUri = null;
  onTrackChangeCallback = null;
  trackHistory = [];
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
