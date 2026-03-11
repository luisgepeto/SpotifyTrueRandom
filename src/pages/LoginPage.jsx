import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { redirectToSpotifyAuth, isAuthenticated } from '../lib/auth.js';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/playlists');
    }
  }, [navigate]);

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎲 TrueRandom</h1>
        <p className="tagline">
          Play your Spotify playlists with truly uniform distribution.
          Each song plays approximately the same number of times.
        </p>
        <button className="login-btn" onClick={redirectToSpotifyAuth}>
          Connect with Spotify
        </button>
        <p className="note">Requires Spotify Premium account</p>
      </div>
    </div>
  );
}
