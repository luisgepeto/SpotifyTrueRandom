import { getCurrentPlayback, playTrack } from './spotify.js';
import { selectNextTrack } from './trueRandom.js';
import { getPlaylistStats, savePlaylistStats, getPlaybackHistory, savePlaybackHistory } from './storage.js';
import { getValidToken } from './auth.js';

const MAX_HISTORY_SIZE = 200;

let pollingInterval = null;
let currentPlaylistId = null;
let currentTracks = null;
let currentTrackUri = null;
let onTrackChangeCallback = null;
let isActive = false;
let trackHistory = [];
let wasPlaying = false;
let playingNextLock = false;

export function startTrueRandomPlayback(playlistId, tracks, deviceId, onTrackChange) {
  stopPlayback();

  currentPlaylistId = playlistId;
  currentTracks = tracks;
  onTrackChangeCallback = onTrackChange;
  isActive = true;
  trackHistory = getPlaybackHistory(playlistId);
  wasPlaying = false;
  playingNextLock = false;

  playNextTrack(deviceId);
}

async function playNextTrack(deviceId) {
  if (!isActive || !currentTracks || currentTracks.length === 0) return;
  if (playingNextLock) return;
  playingNextLock = true;

  const nextTrack = selectNextTrack(currentPlaylistId, currentTracks);
  if (!nextTrack) {
    playingNextLock = false;
    return;
  }

  currentTrackUri = nextTrack.uri;
  trackHistory.push(nextTrack);
  if (trackHistory.length > MAX_HISTORY_SIZE) {
    trackHistory = trackHistory.slice(-MAX_HISTORY_SIZE);
  }
  savePlaybackHistory(currentPlaylistId, trackHistory);

  try {
    await playTrack(nextTrack.uri, deviceId);
    wasPlaying = true;
    if (onTrackChangeCallback) {
      onTrackChangeCallback(nextTrack);
    }
    startPolling(deviceId);
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
  if (trackHistory.length > MAX_HISTORY_SIZE) {
    trackHistory = trackHistory.slice(-MAX_HISTORY_SIZE);
  }
  savePlaybackHistory(currentPlaylistId, trackHistory);
  currentTrackUri = prevTrack.uri;

  playTrack(prevTrack.uri, deviceId)
    .then(() => {
      wasPlaying = true;
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

      // Spotify moved to a different track (user skipped via Spotify app)
      if (currentUri !== currentTrackUri) {
        console.log('[TrueRandom] Track changed externally, playing next');
        playNextTrack(deviceId);
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
  stopPolling();
  currentPlaylistId = null;
  currentTracks = null;
  currentTrackUri = null;
  onTrackChangeCallback = null;
  trackHistory = [];
  wasPlaying = false;
  playingNextLock = false;
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
