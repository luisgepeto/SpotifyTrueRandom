const STORAGE_KEYS = {
  TOKENS: 'truerandom_tokens',
  DEBUG: 'truerandom_debug',
};

function statsKey(playlistId) {
  return `truerandom_stats_${playlistId}`;
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

export function getDebugMode() {
  return localStorage.getItem(STORAGE_KEYS.DEBUG) === 'true';
}

export function setDebugMode(enabled) {
  localStorage.setItem(STORAGE_KEYS.DEBUG, String(enabled));
}
