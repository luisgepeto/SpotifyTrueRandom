const STATS_BASE_URL = import.meta.env.VITE_STATS_BASE_URL || '';

/**
 * Fetch user stats from the server-side JSON file.
 * Returns { tracks: { [trackId]: { playCount, name, artist } }, tolerance, ... }
 */
export async function fetchUserStats(userId) {
  const url = `${STATS_BASE_URL}/data/${userId}.json`;
  const response = await fetch(url);

  if (response.status === 404) {
    // User has no stats yet — return empty
    return { tracks: {}, tolerance: 10 };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.status}`);
  }

  const data = await response.json();
  return {
    tracks: data.tracks || {},
    tolerance: data.tolerance ?? 10,
  };
}
