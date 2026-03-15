import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { isAuthenticated, handleCallback } from './lib/auth.js';
import { getProfile } from './lib/spotify.js';
import { fetchUserStats } from './lib/statsApi.js';
import Navbar from './components/Navbar.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PlaylistsPage from './pages/PlaylistsPage.jsx';
import PlaylistDetailPage from './pages/PlaylistDetailPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

// Handle OAuth callback before React renders.
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
  const [userStats, setUserStats] = useState({ tracks: {}, tolerance: 10 });

  const refreshStats = async (userId) => {
    try {
      const stats = await fetchUserStats(userId);
      setUserStats(stats);
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated()) {
      getProfile()
        .then((profile) => {
          setUser(profile);
          refreshStats(profile.id);
        })
        .catch(() => setUser(null));
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
            <Route path="/playlists" element={
              <PlaylistsPage tolerance={userStats.tolerance} />
            } />
            <Route path="/playlist/:id" element={
              <PlaylistDetailPage
                userStats={userStats}
                userId={user?.id}
                onRefreshStats={() => user && refreshStats(user.id)}
              />
            } />
            <Route path="/stats" element={
              <StatsPage userStats={userStats} userId={user?.id} />
            } />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

