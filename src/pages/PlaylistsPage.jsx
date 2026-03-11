import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth.js';
import { getPlaylists } from '../lib/spotify.js';
import { isPlaybackActive, getCurrentPlaylistId } from '../lib/playback.js';
import PlaylistCard from '../components/PlaylistCard.jsx';
import './PlaylistsPage.css';

export default function PlaylistsPage() {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activePlaylistId = isPlaybackActive() ? getCurrentPlaylistId() : null;

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/');
      return;
    }

    async function loadPlaylists() {
      try {
        const data = await getPlaylists(50);
        setPlaylists(data.items || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadPlaylists();
  }, [navigate]);

  if (loading) return <div className="loading">Loading playlists...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="playlists-page">
      <div className="playlists-sticky-header">
        <h2>Your Playlists</h2>
        <p className="page-summary">
          Select a playlist to play it in <strong>TrueRandom</strong> mode — every song gets played roughly the same number of times, so nothing gets over-repeated or forgotten.
        </p>
      </div>
      <div className="playlists-grid">
        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            isActive={playlist.id === activePlaylistId}
            onClick={() => navigate(`/playlist/${playlist.id}`)}
          />
        ))}
      </div>
      {playlists.length === 0 && (
        <p className="empty">No playlists found.</p>
      )}
    </div>
  );
}
