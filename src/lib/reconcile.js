import { getRecentlyPlayed } from './spotify.js';
import { getGlobalStats, saveGlobalStats, getLastReconciled, saveLastReconciled, getDebugMode } from './storage.js';

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Reconcile global play counts from Spotify's recently-played history.
 * Fetches tracks played since lastReconciled (or last 24h on first run).
 * Only increments counts — never decrements.
 * Returns { reconciledCount } or null on error.
 */
export async function reconcileFromRecentlyPlayed() {
  const debugMode = getDebugMode();
  const lastReconciled = getLastReconciled();
  const after = lastReconciled || (Date.now() - DEFAULT_LOOKBACK_MS);

  try {
    const response = await getRecentlyPlayed(50, after);
    const items = response?.items || [];

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
