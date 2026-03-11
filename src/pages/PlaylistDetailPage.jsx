import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth.js';
import { getPlaylist, getAllPlaylistTracks, getDevices, pausePlayback, resumePlayback } from '../lib/spotify.js';
import { getTrackStats } from '../lib/trueRandom.js';
import { getPlaylistStats, savePlaylistStats, clearPlaylistStats, getDebugMode, setDebugMode, getQueueSize, setQueueSize } from '../lib/storage.js';
import { startTrueRandomPlayback, skipTrack, previousTrack, isPlaybackActive, getCurrentPlaylistId } from '../lib/playback.js';
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
  const [queueSize, setQueueSizeState] = useState(getQueueSize());
  const [debugMode, setDebugModeState] = useState(getDebugMode());
  const [sortField, setSortField] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

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

  useEffect(() => {
    setIsPlaying(isPlaybackActive() && getCurrentPlaylistId() === playlistId);
  }, [playlistId]);

  const handlePlay = async () => {
    try {
      const devices = await getDevices();
      if (devices.length === 0) {
        setError('No active Spotify device found. Open Spotify on your phone or computer.');
        return;
      }
      const activeDevice = devices.find((d) => d.is_active) || devices[0];
      setDeviceId(activeDevice.id);

      startTrueRandomPlayback(playlistId, tracks, activeDevice.id, (track) => {
        setCurrentTrack(track);
        setIsPaused(false);
        const updatedStats = getTrackStats(playlistId, tracks);
        setStats(updatedStats);
      });
      setIsPlaying(true);
      setIsPaused(false);
    } catch (err) {
      setError(err.message);
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

  const handlePrevious = () => {
    previousTrack(deviceId);
    setIsPaused(false);
  };

  const handleSkip = () => {
    skipTrack(deviceId);
    setIsPaused(false);
  };

  const handleToleranceChange = (newTolerance) => {
    const val = Math.max(1, parseInt(newTolerance) || 10);
    setTolerance(val);
    const currentStats = getPlaylistStats(playlistId);
    currentStats.tolerance = val;
    savePlaylistStats(playlistId, currentStats);
  };

  const handleQueueSizeChange = (newSize) => {
    const val = Math.max(1, parseInt(newSize) || 50);
    setQueueSizeState(val);
    setQueueSize(val);
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
            <button
              className={`play-btn ${isPlaying ? 'active' : ''}`}
              onClick={handlePlay}
            >
              {isPlaying ? '🎲 TrueRandom Active' : '🎲 Start TrueRandom'}
            </button>
          </div>
        </div>

        <div className="now-playing">
          {isPlaying && currentTrack ? (
            <>
              <div className="now-playing-track">
                {currentTrack.albumImage && (
                  <img className="now-playing-art" src={currentTrack.albumImage} alt={currentTrack.album} />
                )}
                <div className="now-playing-info">
                  <span className="now-playing-name">{currentTrack.name}</span>
                  <span className="now-playing-artist">{currentTrack.artist}</span>
                </div>
              </div>
              <div className="now-playing-controls">
                <button className="ctrl-btn" onClick={handlePrevious} title="Previous">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H2.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h.6z"/></svg>
                </button>
                <button className="ctrl-btn play-pause" onClick={handlePlayPause} title={isPaused ? 'Play' : 'Pause'}>
                  {isPaused ? (
                    <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
                  ) : (
                    <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"/></svg>
                  )}
                </button>
                <button className="ctrl-btn" onClick={handleSkip} title="Next">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-.6z"/></svg>
                </button>
              </div>
              <span className="now-playing-hint">Volume & seek via Spotify app</span>
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
          <label>
            Queue size:
            <input
              type="number"
              min="1"
              max="50"
              value={queueSize}
              onChange={(e) => handleQueueSizeChange(e.target.value)}
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
