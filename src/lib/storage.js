const STORAGE_KEYS = {
  TOKENS: 'truerandom_tokens',
  DEBUG: 'truerandom_debug',
};

function statsKey(playlistId) {
  return `truerandom_stats_${playlistId}`;
}

function historyKey(playlistId) {
  return `truerandom_history_${playlistId}`;
}

export function getTokens() {
  const raw = localStorage.getItem(STORAGE_KEYS.TOKENS);
  return raw ? JSON.parse(raw) : null;
}

export function saveTokens(tokens) {
  localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
}

export function clearTokens() {
  localStorage.removeItem(STORAGE_KEYS.TOKENS);
}

export function getPlaylistStats(playlistId) {
  const raw = localStorage.getItem(statsKey(playlistId));
  return raw ? JSON.parse(raw) : { tolerance: 10, tracks: {} };
}

export function savePlaylistStats(playlistId, stats) {
  localStorage.setItem(statsKey(playlistId), JSON.stringify(stats));
}

export function clearPlaylistStats(playlistId) {
  localStorage.removeItem(statsKey(playlistId));
}

export function getPlaybackHistory(playlistId) {
  const raw = localStorage.getItem(historyKey(playlistId));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function savePlaybackHistory(playlistId, history) {
  localStorage.setItem(historyKey(playlistId), JSON.stringify(history));
}

export function clearPlaybackHistory(playlistId) {
  localStorage.removeItem(historyKey(playlistId));
}

export function getDebugMode() {
  return localStorage.getItem(STORAGE_KEYS.DEBUG) === 'true';
}

export function setDebugMode(enabled) {
  localStorage.setItem(STORAGE_KEYS.DEBUG, String(enabled));
}
