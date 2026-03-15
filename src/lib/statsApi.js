const STATS_BASE_URL = import.meta.env.VITE_STATS_BASE_URL || '';

/**
 * Fetch user stats from the server-side JSON file.
 * Returns { tracks: { [trackId]: { playCount, name, artist } }, tolerance, ... }
 */
export async function fetchUserStats(userId) {
  const url = `${STATS_BASE_URL}/data/${userId}.json`;
  const response = await fetch(url);

  if (response.status === 404) {
    return { tracks: {}, tolerance: 10 };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.status}`);
  }

  const data = await response.json();
  return {
    tracks: data.tracks || {},
    tolerance: data.tolerance ?? 10,
    displayName: data.displayName,
    lastReconciledAt: data.lastReconciledAt,
    lastTokenRefreshAt: data.lastTokenRefreshAt,
    initialAuthAt: data.initialAuthAt,
  };
}

/**
 * Fetch cached playlists for a user from the server.
 * Returns { playlists: [...], cachedAt: string } or null if not cached.
 */
export async function fetchCachedPlaylists(userId) {
  const url = `${STATS_BASE_URL}/cache/user_${userId}_playlists.json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

/**
 * Fetch cached playlist detail (metadata + tracks) from the server.
 * Returns { id, name, images, tracks: [...], cachedAt: string } or null if not cached.
 */
export async function fetchCachedPlaylist(playlistId) {
  const url = `${STATS_BASE_URL}/cache/playlist_${playlistId}.json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}
