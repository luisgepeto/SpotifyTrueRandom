import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated, logout } from '../lib/auth.js';
import { getPlaylists } from '../lib/spotify.js';
import { fetchCachedPlaylists } from '../lib/statsApi.js';
import PlaylistCard from '../components/PlaylistCard.jsx';
import './PlaylistsPage.css';

export default function PlaylistsPage({ tolerance, userId }) {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cachedAt, setCachedAt] = useState(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/');
      return;
    }

    async function loadPlaylists() {
      try {
        // Try server cache first
        if (userId) {
          const cached = await fetchCachedPlaylists(userId);
          if (cached?.playlists) {
            const sorted = cached.playlists.sort((a, b) => a.name.localeCompare(b.name));
            setPlaylists(sorted);
            setCachedAt(cached.cachedAt);
            setLoading(false);
            return;
          }
        }

        // Fallback to Spotify API
        const data = await getPlaylists(50);
        const sorted = (data.items || []).sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setPlaylists(sorted);
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
    }

    loadPlaylists();
  }, [navigate, userId]);

  if (loading) return <div className="loading">Loading playlists...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredPlaylists = normalizedQuery
    ? playlists.filter((p) => p.name.toLowerCase().includes(normalizedQuery))
    : playlists;

  return (
    <div className="playlists-page">
      <div className="playlists-sticky-header">
        <h2>Your Playlists</h2>
        <p className="page-summary">
          Select a playlist to play it in <strong>TrueRandom</strong> mode — every song gets played roughly the same number of times, so nothing gets over-repeated or forgotten.
        </p>
        <input
          className="playlists-search"
          type="search"
          placeholder="Search playlists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search playlists"
        />
        <div className="tolerance-row">
          <span className="tolerance-hint">Tolerance: <strong>{tolerance}</strong></span>
          {cachedAt && (
            <span className="cache-hint">Cache: {new Date(cachedAt).toLocaleString()}</span>
          )}
        </div>
      </div>
      <div className="playlists-grid">
        {filteredPlaylists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            onClick={() => navigate(`/playlist/${playlist.id}`)}
          />
        ))}
      </div>
      {filteredPlaylists.length === 0 && (
        <p className="empty">
          {normalizedQuery ? 'No playlists match your search.' : 'No playlists found.'}
        </p>
      )}
    </div>
  );
}
