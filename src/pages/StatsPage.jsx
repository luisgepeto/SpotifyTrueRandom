import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth.js';
import { useEffect, useState } from 'react';
import './StatsPage.css';

export default function StatsPage({ userStats, userId }) {
  const navigate = useNavigate();
  const [reconcileLog, setReconcileLog] = useState(null);
  const [logLoading, setLogLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/');
      return;
    }

    const baseUrl = import.meta.env.VITE_STATS_BASE_URL || window.location.origin;
    fetch(`${baseUrl}/reconcile-log`)
      .then((r) => r.text())
      .then(setReconcileLog)
      .catch(() => setReconcileLog('Failed to load reconciliation log.'))
      .finally(() => setLogLoading(false));
  }, [navigate]);

  const tracks = userStats?.tracks || {};
  const trackList = Object.entries(tracks)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.playCount - a.playCount);

  const totalPlays = trackList.reduce((sum, t) => sum + t.playCount, 0);
  const uniqueTracks = trackList.length;
  const avgPlays = uniqueTracks > 0 ? (totalPlays / uniqueTracks).toFixed(1) : 0;
  const maxPlays = uniqueTracks > 0 ? Math.max(...trackList.map((t) => t.playCount)) : 0;
  const minPlays = uniqueTracks > 0 ? Math.min(...trackList.map((t) => t.playCount)) : 0;

  const formatDate = (iso) => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="stats-page">
      <button className="back-btn" onClick={() => navigate('/playlists')}>← Playlists</button>

      <h2>Global Stats</h2>

      <div className="stats-info">
        <div className="info-row">
          <span className="info-label">User</span>
          <span className="info-value">{userStats?.displayName || userId}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Tolerance</span>
          <span className="info-value">{userStats?.tolerance ?? 10}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Initial Auth</span>
          <span className="info-value">{formatDate(userStats?.initialAuthAt)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Last Token Refresh</span>
          <span className="info-value">{formatDate(userStats?.lastTokenRefreshAt)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Last Reconciled</span>
          <span className="info-value">{formatDate(userStats?.lastReconciledAt)}</span>
        </div>
      </div>

      <div className="stats-summary-grid">
        <div className="stat-box">
          <span className="stat-number">{uniqueTracks}</span>
          <span className="stat-desc">Unique Tracks</span>
        </div>
        <div className="stat-box">
          <span className="stat-number">{totalPlays}</span>
          <span className="stat-desc">Total Plays</span>
        </div>
        <div className="stat-box">
          <span className="stat-number">{avgPlays}</span>
          <span className="stat-desc">Avg Plays</span>
        </div>
        <div className="stat-box">
          <span className="stat-number">{minPlays}</span>
          <span className="stat-desc">Min</span>
        </div>
        <div className="stat-box">
          <span className="stat-number">{maxPlays}</span>
          <span className="stat-desc">Max</span>
        </div>
      </div>

      <h3>All Tracked Songs ({uniqueTracks})</h3>
      <input
        className="stats-search"
        type="search"
        placeholder="Search songs..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search tracked songs"
      />
      <div className="stats-table">
        <div className="stats-table-header">
          <span className="col-song">Song</span>
          <span className="col-artist">Artist</span>
          <span className="col-last-played">Last Played</span>
          <span className="col-plays">Plays</span>
        </div>
        <div className="stats-table-body">
          {trackList
            .filter((t) => {
              if (!searchQuery.trim()) return true;
              const q = searchQuery.trim().toLowerCase();
              return t.name?.toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q);
            })
            .map((track) => (
            <div key={track.id} className="stats-table-row">
              <span className="col-song">{track.name || track.id}</span>
              <span className="col-artist">{track.artist || '—'}</span>
              <span className="col-last-played">{track.lastPlayedAt ? new Date(track.lastPlayedAt).toLocaleString() : '—'}</span>
              <span className="col-plays">{track.playCount}</span>
            </div>
          ))}
          {trackList.length === 0 && (
            <div className="stats-empty">No tracked songs yet. Stats will appear after the server reconciles your listening history.</div>
          )}
        </div>
      </div>

      <h3>Reconciliation Log</h3>
      <div className="reconcile-log">
        {logLoading ? (
          <div className="stats-empty">Loading log...</div>
        ) : (
          <pre className="log-content">{reconcileLog}</pre>
        )}
      </div>
    </div>
  );
}
