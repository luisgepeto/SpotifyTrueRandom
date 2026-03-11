import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleCallback } from '../lib/auth.js';

export default function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function processCallback() {
      const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
      const code = params.get('code');
      const errorParam = params.get('error');

      if (errorParam) {
        setError(`Spotify auth error: ${errorParam}`);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        return;
      }

      try {
        await handleCallback(code);
        navigate('/playlists');
      } catch (err) {
        setError(err.message);
      }
    }

    processCallback();
  }, [navigate]);

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Authentication Error</h2>
        <p style={{ color: '#ff4444' }}>{error}</p>
        <button onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <p>Connecting to Spotify...</p>
    </div>
  );
}
