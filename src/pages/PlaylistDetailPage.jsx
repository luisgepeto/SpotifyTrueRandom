import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { isAuthenticated, logout } from '../lib/auth.js';
import { getPlaylist, getAllPlaylistTracks } from '../lib/spotify.js';
import { getTrackStats } from '../lib/trueRandom.js';
import { getGlobalTolerance, clearGlobalStats, getDebugMode, setDebugMode } from '../lib/storage.js';
import { startTrueRandom, addToTrueRandomQueue, checkIsPlaying } from '../lib/playback.js';
import { reconcileFromRecentlyPlayed } from '../lib/reconcile.js';
import { BATCH_SIZE } from '../lib/queueManager.js';
import TrackRow from '../components/TrackRow.jsx';
import './PlaylistDetailPage.css';

export default function PlaylistDetailPage() {
  const { id: playlistId } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugMode, setDebugModeState] = useState(getDebugMode());
  const [sortField, setSortField] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queueProgress, setQueueProgress] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [playlistData, allTracks] = await Promise.all([
        getPlaylist(playlistId),
        getAllPlaylistTracks(playlistId),
      ]);
      setPlaylist(playlistData);
      setTracks(allTracks);
      const trackStats = getTrackStats(allTracks);
      setStats(trackStats);
    } catch (err) {
      if (!isAuthenticated()) {
        logout();
        navigate('/');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [playlistId, navigate]);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/');
      return;
    }

    // Reconcile on mount, then load data
    reconcileFromRecentlyPlayed().finally(() => loadData());

    // Check if Spotify is currently playing
    checkIsPlaying().then(setIsPlaying);
  }, [navigate, loadData]);

  const handleEnqueue = async () => {
    try {
      setError(null);
      setQueueProgress({ queued: 0, total: BATCH_SIZE });

      if (isPlaying) {
        await addToTrueRandomQueue(
          playlistId,
          tracks,
          (queued, total) => setQueueProgress({ queued, total }),
        );
      } else {
        await startTrueRandom(
          playlistId,
          tracks,
          (queued, total) => setQueueProgress({ queued, total }),
        );
      }

      setQueueProgress(null);
      setIsPlaying(true);

      // Reload stats
      const trackStats = getTrackStats(tracks);
      setStats(trackStats);
    } catch (err) {
      if (!isAuthenticated()) {
        logout();
        navigate('/');
        return;
      }
      setError(err.message);
      setQueueProgress(null);
    }
  };

  const handleClearStats = () => {
    if (window.confirm('Are you sure you want to clear all play statistics? This cannot be undone.')) {
      clearGlobalStats();
      loadData();
    }
  };

  const handleDebugToggle = () => {
    const newVal = !debugMode;
    setDebugModeState(newVal);
    setDebugMode(newVal);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'name');
    }
  };

  const sortedTracks = stats?.tracks ? [...stats.tracks].sort((a, b) => {
    let cmp;
    if (sortField === 'playCount') {
      cmp = a.playCount - b.playCount;
    } else {
      cmp = a.name.localeCompare(b.name);
    }
    return sortAsc ? cmp : -cmp;
  }) : [];

  if (loading) return <div className="loading">Loading playlist...</div>;
  if (error && !tracks.length) return <div className="error">Error: {error}</div>;

  return (
    <div className="playlist-detail">
      <div className="detail-sticky">
        <button className="back-btn" onClick={() => navigate('/playlists')}>← Playlists</button>

        <div className="detail-header">
          <div className="playlist-info">
            <div className="playlist-cover">
              {playlist?.images?.[0]?.url ? (
                <img src={playlist.images[0].url} alt={playlist?.name} />
              ) : (
                <div className="playlist-cover-placeholder">🎵</div>
              )}
            </div>
            <div className="playlist-meta">
              <h2 className="playlist-name">{playlist?.name ?? 'Playlist'}</h2>
              <p className="playlist-track-count">{tracks.length} songs</p>
            </div>
          </div>
          <div className="detail-actions">
            <button
              className="play-btn"
              onClick={handleEnqueue}
              disabled={queueProgress !== null}
            >
              {isPlaying ? '🎲 Enqueue TrueRandom' : '🎲 Start TrueRandom'}
            </button>
          </div>
        </div>

        {/* Queue progress indicator */}
        {queueProgress && (
          <div className="queue-progress">
            <div className="queue-progress-bar">
              <div
                className="queue-progress-fill"
                style={{ width: `${(queueProgress.queued / queueProgress.total) * 100}%` }}
              />
            </div>
            <span className="queue-progress-text">
              Queueing songs... {queueProgress.queued}/{queueProgress.total}
            </span>
          </div>
        )}

        {error && <div className="error-inline">{error}</div>}

        <div className="stats-summary">
          <div className="stat-item">
            <span className="stat-label">Songs</span>
            <span className="stat-value">{tracks.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Average</span>
            <span className="stat-value">{stats?.average?.toFixed(1) ?? 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Min</span>
            <span className="stat-value">{stats?.min ?? 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Max</span>
            <span className="stat-value">{stats?.max ?? 0}</span>
          </div>
        </div>

        <div className="settings-row">
          <label className="debug-label">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={handleDebugToggle}
            />
            Debug Mode
          </label>
          <button className="clear-btn" onClick={handleClearStats}>
            Clear Statistics
          </button>
        </div>

        <div className="tracks-header">
          <span className="col-name sortable" onClick={() => handleSort('name')}>
            Song {sortField === 'name' ? (sortAsc ? '↑' : '↓') : ''}
          </span>
          <span className="col-artist">Artist</span>
          <span className="col-count sortable" onClick={() => handleSort('playCount')}>
            Plays {sortField === 'playCount' ? (sortAsc ? '↑' : '↓') : ''}
          </span>
        </div>
      </div>

      <div className="tracks-scroll">
        {sortedTracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            average={stats?.average ?? 0}
            tolerance={getGlobalTolerance()}
          />
        ))}
      </div>
    </div>
  );
}
