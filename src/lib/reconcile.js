import { getRecentlyPlayed } from './spotify.js';
import { getGlobalStats, saveGlobalStats, getLastReconciled, saveLastReconciled, getDebugMode } from './storage.js';

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_PAGES = 20; // safety cap to avoid infinite loops

/**
 * Fetch ALL recently-played tracks since a given timestamp by paginating
 * through the Spotify API using cursor-based `after` parameter.
 * Each page returns up to 50 items; we keep fetching while we get 50.
 */
async function fetchAllRecentlyPlayed(since, debugMode) {
  const allItems = [];
  let cursor = since;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await getRecentlyPlayed(50, cursor);
    const items = response?.items || [];
    allItems.push(...items);

    if (debugMode) {
      console.log(`[TrueRandom] Reconciliation page ${page + 1}: fetched ${items.length} items (total: ${allItems.length})`);
    }

    // If we got fewer than 50, we've reached the end
    if (items.length < 50) break;

    // Use the cursor from the response to fetch the next page
    const nextCursor = response?.cursors?.after;
    if (!nextCursor || nextCursor === String(cursor)) break;
    cursor = Number(nextCursor);
  }

  return allItems;
}

/**
 * Reconcile global play counts from Spotify's recently-played history.
 * Paginates through all tracks played since lastReconciled (or last 24h on first run).
 * Only increments counts — never decrements.
 * Returns { reconciledCount } or null on error.
 */
export async function reconcileFromRecentlyPlayed() {
  const debugMode = getDebugMode();
  const lastReconciled = getLastReconciled();
  const after = lastReconciled || (Date.now() - DEFAULT_LOOKBACK_MS);

  try {
    const items = await fetchAllRecentlyPlayed(after, debugMode);

    if (items.length === 0) {
      saveLastReconciled(Date.now());
      if (debugMode) console.log('[TrueRandom] Reconciliation: no new plays found.');
      return { reconciledCount: 0 };
    }

    // Count plays per track ID
    const playCounts = {};
    for (const item of items) {
      const trackId = item.track?.id;
      if (!trackId) continue;
      playCounts[trackId] = (playCounts[trackId] || 0) + 1;
    }

    // Update global stats
    const stats = getGlobalStats();
    let reconciledCount = 0;

    for (const [trackId, count] of Object.entries(playCounts)) {
      if (!stats.tracks[trackId]) {
        stats.tracks[trackId] = {
          playCount: count,
          name: items.find((i) => i.track.id === trackId)?.track.name || 'Unknown',
          artist: items.find((i) => i.track.id === trackId)?.track.artists?.map((a) => a.name).join(', ') || 'Unknown',
        };
      } else {
        stats.tracks[trackId].playCount += count;
      }
      reconciledCount += count;
    }

    saveGlobalStats(stats);

    // Update lastReconciled to the most recent played_at timestamp
    const mostRecent = items.reduce((latest, item) => {
      const t = new Date(item.played_at).getTime();
      return t > latest ? t : latest;
    }, after);
    saveLastReconciled(mostRecent);

    if (debugMode) {
      console.log(`[TrueRandom] Reconciled ${reconciledCount} plays across ${Object.keys(playCounts).length} tracks.`);
    }

    return { reconciledCount };
  } catch (err) {
    console.error('[TrueRandom] Reconciliation error:', err);
    return null;
  }
}
