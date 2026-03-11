import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { isAuthenticated, handleCallback } from './lib/auth.js';
import { getProfile } from './lib/spotify.js';
import { reconcileFromRecentlyPlayed } from './lib/reconcile.js';
import Navbar from './components/Navbar.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PlaylistsPage from './pages/PlaylistsPage.jsx';
import PlaylistDetailPage from './pages/PlaylistDetailPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Handle OAuth callback before React renders.
// Spotify redirects to http://127.0.0.1:5173/?code=xxx
// We intercept the code param, exchange it for tokens, then clean the URL.
function useOAuthCallback() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function processCode() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        console.error('Spotify auth error:', error);
        window.history.replaceState({}, '', window.location.pathname);
        setReady(true);
        return;
      }

      if (code) {
        try {
          await handleCallback(code);
        } catch (err) {
          console.error('Token exchange failed:', err);
        }
        window.history.replaceState({}, '', window.location.pathname + '#/playlists');
      }

      setReady(true);
    }

    processCode();
  }, []);

  return ready;
}

export default function App() {
  const ready = useOAuthCallback();
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated()) {
      getProfile()
        .then(setUser)
        .catch(() => setUser(null));

      // Reconcile on app load
      reconcileFromRecentlyPlayed();

      // Periodic reconciliation while app is open
      const interval = setInterval(() => {
        reconcileFromRecentlyPlayed();
      }, RECONCILE_INTERVAL_MS);

      return () => clearInterval(interval);
    }
  }, [ready]);

  if (!ready) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Connecting to Spotify...</div>;
  }

  return (
    <HashRouter>
      <div className="app">
        <Navbar user={user} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/playlist/:id" element={<PlaylistDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

