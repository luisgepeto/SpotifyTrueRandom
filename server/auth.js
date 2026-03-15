import 'dotenv/config';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || '192.168.50.52';
const REDIRECT_URI = `https://${HOST}:${PORT}/callback`;

const SSL_KEY = path.join(__dirname, 'key.pem');
const SSL_CERT = path.join(__dirname, 'cert.pem');

const SCOPES = [
  'user-read-recently-played',
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const state = crypto.randomBytes(16).toString('hex');

const sslOptions = {
  key: fs.readFileSync(SSL_KEY),
  cert: fs.readFileSync(SSL_CERT),
};

const server = https.createServer(sslOptions, async (req, res) => {
  const url = new URL(req.url, `https://${HOST}:${PORT}`);

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`Authorization failed: ${error}`);
      shutdownServer();
      return;
    }

    if (returnedState !== state) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('State mismatch. Possible CSRF attack.');
      shutdownServer();
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('No authorization code received.');
      shutdownServer();
      return;
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${tokenResponse.status} ${errBody}`);
      }

      const tokenData = await tokenResponse.json();

      // Fetch user profile
      const profileResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!profileResponse.ok) {
        throw new Error(`Profile fetch failed: ${profileResponse.status}`);
      }

      const profile = await profileResponse.json();
      const userId = profile.id;
      const displayName = profile.display_name || userId;

      // Load existing data or create new
      const userFile = path.join(DATA_DIR, `${userId}.json`);
      let userData = { userId, displayName, tokens: {}, lastReconciled: null, tracks: {} };

      if (fs.existsSync(userFile)) {
        try {
          userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
          console.log(`Existing user file found for ${displayName}. Updating tokens.`);
        } catch {
          console.log(`Corrupt user file for ${userId}, creating fresh.`);
        }
      }

      userData.userId = userId;
      userData.displayName = displayName;
      userData.tokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      };

      fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));

      console.log(`\n✅ User "${displayName}" (${userId}) authenticated successfully!`);
      console.log(`   Tokens saved to: ${userFile}\n`);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body style="font-family:sans-serif;text-align:center;padding:3rem">
          <h1>✅ Authenticated!</h1>
          <p>User: <strong>${displayName}</strong> (${userId})</p>
          <p>Tokens saved. You can close this window.</p>
        </body></html>
      `);
    } catch (err) {
      console.error('Auth error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Authentication error: ${err.message}`);
    }

    shutdownServer();
    return;
  }

  // Any other path: show a message
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Waiting for Spotify callback...');
});

function shutdownServer() {
  setTimeout(() => {
    server.close(() => {
      console.log('Auth server stopped.');
      process.exit(0);
    });
  }, 1000);
}

server.listen(PORT, '0.0.0.0', () => {
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);

  console.log('\n🎵 TrueRandom — Spotify Authorization');
  console.log('─'.repeat(50));
  console.log(`\nOpen this URL in your browser to authorize:\n`);
  console.log(authUrl.toString());
  console.log(`\nWaiting for callback on port ${PORT}...\n`);
});
