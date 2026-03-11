const STORAGE_KEYS = {
  TOKENS: 'truerandom_tokens',
  DEBUG: 'truerandom_debug',
  GLOBAL_STATS: 'truerandom_global_stats',
  GLOBAL_TOLERANCE: 'truerandom_tolerance',
  LAST_RECONCILED: 'truerandom_last_reconciled',
  LAST_QUEUED_PLAYLIST: 'truerandom_last_queued_playlist',
};

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

export function getGlobalStats() {
  const raw = localStorage.getItem(STORAGE_KEYS.GLOBAL_STATS);
  return raw ? JSON.parse(raw) : { tracks: {} };
}

export function saveGlobalStats(stats) {
  localStorage.setItem(STORAGE_KEYS.GLOBAL_STATS, JSON.stringify(stats));
}

export function clearGlobalStats() {
  localStorage.removeItem(STORAGE_KEYS.GLOBAL_STATS);
}

export function getGlobalTolerance() {
  const raw = localStorage.getItem(STORAGE_KEYS.GLOBAL_TOLERANCE);
  return raw ? parseInt(raw, 10) : 10;
}

export function saveGlobalTolerance(tolerance) {
  localStorage.setItem(STORAGE_KEYS.GLOBAL_TOLERANCE, String(tolerance));
}

export function getLastReconciled() {
  const raw = localStorage.getItem(STORAGE_KEYS.LAST_RECONCILED);
  return raw ? parseInt(raw, 10) : null;
}

export function saveLastReconciled(timestamp) {
  localStorage.setItem(STORAGE_KEYS.LAST_RECONCILED, String(timestamp));
}

export function getLastQueuedPlaylist() {
  return localStorage.getItem(STORAGE_KEYS.LAST_QUEUED_PLAYLIST);
}

export function saveLastQueuedPlaylist(playlistId) {
  localStorage.setItem(STORAGE_KEYS.LAST_QUEUED_PLAYLIST, playlistId);
}

export function getDebugMode() {
  return localStorage.getItem(STORAGE_KEYS.DEBUG) === 'true';
}

export function setDebugMode(enabled) {
  localStorage.setItem(STORAGE_KEYS.DEBUG, String(enabled));
}
