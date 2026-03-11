import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth.js';
import { getPlaylist, getAllPlaylistTracks, getDevices, pausePlayback, resumePlayback } from '../lib/spotify.js';
import { getTrackStats } from '../lib/trueRandom.js';
import { getPlaylistStats, savePlaylistStats, clearPlaylistStats, getDebugMode, setDebugMode } from '../lib/storage.js';
import { startTrueRandomQueue, refillQueue, reconcileOnReturn } from '../lib/playback.js';
import { getSavedQueue, BATCH_SIZE } from '../lib/queueManager.js';
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
  const [tolerance, setTolerance] = useState(10);
  const [debugMode, setDebugModeState] = useState(getDebugMode());
  const [sortField, setSortField] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [queueProgress, setQueueProgress] = useState(null); // { queued, total }
  const [queueRemaining, setQueueRemaining] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [playlistData, allTracks] = await Promise.all([
        getPlaylist(playlistId),
        getAllPlaylistTracks(playlistId),
      ]);
      setPlaylist(playlistData);
      setTracks(allTracks);
      const trackStats = getTrackStats(playlistId, allTracks);
      setStats(trackStats);
      setTolerance(trackStats.tolerance);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/');
      return;
    }
    loadData();
  }, [navigate, loadData]);

  // Check for existing session and reconcile on mount
  useEffect(() => {
    const savedQueue = getSavedQueue();
    if (savedQueue && savedQueue.playlistId === playlistId) {
      setIsActive(true);
      setQueueRemaining(savedQueue.tracks.length);
      // Try to reconcile play counts
      reconcileOnReturn().then((result) => {
        if (result) {
          setQueueRemaining(result.remainingInQueue);
          if (result.currentTrack) {
            setCurrentTrack(result.currentTrack);
          }
          // Reload stats after reconciliation
          loadData();
        }
      });
    }
  }, [playlistId, loadData]);

  const handleStartQueue = async () => {
    try {
      setError(null);
      const devices = await getDevices();
      if (devices.length === 0) {
        setError('No active Spotify device found. Open Spotify on your phone or computer.');
        return;
      }
      const activeDevice = devices.find((d) => d.is_active) || devices[0];
      setDeviceId(activeDevice.id);

      setQueueProgress({ queued: 0, total: BATCH_SIZE });

      const queueData = await startTrueRandomQueue(
        playlistId,
        tracks,
        activeDevice.id,
        (queued, total) => setQueueProgress({ queued, total }),
        (status) => {
          if (status.currentTrack) setCurrentTrack(status.currentTrack);
          if (status.queueRemaining !== undefined) setQueueRemaining(status.queueRemaining);
          if (status.isPlaying !== undefined) setIsPaused(!status.isPlaying);
        },
      );

      setIsActive(true);
      setIsPaused(false);
      setQueueRemaining(queueData.tracks.length - 1);
      if (queueData.tracks.length > 0) {
        setCurrentTrack(queueData.tracks[0]);
      }
      setQueueProgress(null);

      // Reload stats
      const trackStats = getTrackStats(playlistId, tracks);
      setStats(trackStats);
    } catch (err) {
      setError(err.message);
      setQueueProgress(null);
    }
  };

  const handleRefillQueue = async () => {
    try {
      if (!deviceId) {
        const devices = await getDevices();
        if (devices.length === 0) {
          setError('No active Spotify device found.');
          return;
        }
        const activeDevice = devices.find((d) => d.is_active) || devices[0];
        setDeviceId(activeDevice.id);
      }

      setQueueProgress({ queued: 0, total: BATCH_SIZE });

      const batch = await refillQueue(
        tracks,
        deviceId,
        (queued, total) => setQueueProgress({ queued, total }),
      );

      if (batch) {
        setQueueRemaining((prev) => prev + batch.length);
      }
      setQueueProgress(null);
    } catch (err) {
      setError(err.message);
      setQueueProgress(null);
    }
  };

  const handlePlayPause = async () => {
    try {
      if (isPaused) {
        await resumePlayback();
        setIsPaused(false);
      } else {
        await pausePlayback();
        setIsPaused(true);
      }
    } catch (err) {
      console.error('Play/Pause error:', err);
    }
  };

  const handleToleranceChange = (newTolerance) => {
    const val = Math.max(1, parseInt(newTolerance) || 10);
    setTolerance(val);
    const currentStats = getPlaylistStats(playlistId);
    currentStats.tolerance = val;
    savePlaylistStats(playlistId, currentStats);
  };

  const handleClearStats = () => {
    if (window.confirm('Are you sure you want to clear all statistics for this playlist? This cannot be undone.')) {
      clearPlaylistStats(playlistId);
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
  if (error) return <div className="error">Error: {error}</div>;

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
            {(!isActive || queueRemaining === 0) && (
              <button
                className="play-btn"
                onClick={handleStartQueue}
                disabled={queueProgress !== null}
              >
                🎲 Start TrueRandom
              </button>
            )}
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

        {/* Now playing + controls */}
        <div className="now-playing">
          {isActive && currentTrack ? (
            <>
              <div className="now-playing-track">
                {currentTrack.albumImage && (
                  <img className="now-playing-art" src={currentTrack.albumImage} alt="" />
                )}
                <div className="now-playing-info">
                  <span className="now-playing-name">{currentTrack.name}</span>
                  <span className="now-playing-artist">{currentTrack.artist}</span>
                </div>
              </div>
              <div className="now-playing-controls">
                <button className="ctrl-btn play-pause" onClick={handlePlayPause} title={isPaused ? 'Play' : 'Pause'}>
                  {isPaused ? (
                    <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
                  ) : (
                    <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"/></svg>
                  )}
                </button>
              </div>
              <div className="queue-status">
                <span className="queue-remaining">{queueRemaining} songs queued</span>
                <button className="refill-btn" onClick={handleRefillQueue} disabled={queueProgress !== null}>
                  + Refill Queue
                </button>
              </div>
            </>
          ) : (
            <span className="now-playing-empty">No track playing</span>
          )}
        </div>

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
          <label>
            Tolerance:
            <input
              type="number"
              min="1"
              value={tolerance}
              onChange={(e) => handleToleranceChange(e.target.value)}
              className="tolerance-input"
            />
          </label>
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
            tolerance={tolerance}
          />
        ))}
      </div>
    </div>
  );
}
