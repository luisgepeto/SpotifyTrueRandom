/**
 * Get track stats for display, using server-provided stats.
 * @param {Array} tracks - playlist tracks
 * @param {Object} stats - { tracks: { [id]: { playCount, name, artist } } } from server
 */
export function getTrackStats(tracks, stats) {
  const seen = new Set();

  const trackStats = tracks
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    })
    .map((track) => {
      const data = stats.tracks[track.id];
      return {
        ...track,
        playCount: data?.playCount ?? 0,
      };
    });

  const counts = trackStats.map((t) => t.playCount);
  const average = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const min = counts.length > 0 ? Math.min(...counts) : 0;
  const max = counts.length > 0 ? Math.max(...counts) : 0;

  return {
    tracks: trackStats,
    average,
    min,
    max,
  };
}
