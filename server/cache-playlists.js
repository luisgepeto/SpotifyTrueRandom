import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// --- Helpers ---

function getUserFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => path.join(DATA_DIR, f));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// --- Token management (same as reconcile.js) ---

async function refreshAccessToken(userData) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: userData.tokens.refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  userData.tokens.accessToken = data.access_token;
  userData.tokens.expiresAt = Date.now() + data.expires_in * 1000;
  userData.lastTokenRefreshAt = new Date().toISOString();
  if (data.refresh_token) {
    userData.tokens.refreshToken = data.refresh_token;
  }
}

async function ensureValidToken(userData) {
  if (!userData.tokens.accessToken || Date.now() > userData.tokens.expiresAt - 60_000) {
    await refreshAccessToken(userData);
  }
}

// --- Spotify API with 429 retry ---

async function spotifyGet(endpoint, accessToken, retries = 0) {
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) throw new Error('TOKEN_EXPIRED');

  if (response.status === 429) {
    if (retries >= 5) throw new Error('Rate limit exceeded after retries');
    const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
    const delay = Math.max(retryAfter, 1) * 1000;
    console.log(`    ⏳ Rate limited, retrying in ${delay}ms...`);
    await new Promise((r) => setTimeout(r, delay));
    return spotifyGet(endpoint, accessToken, retries + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${body}`);
  }

  return response.json();
}

// --- Fetch all playlists for a user ---

async function fetchUserPlaylists(accessToken) {
  const playlists = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const data = await spotifyGet(`/me/playlists?limit=${limit}&offset=${offset}`, accessToken);
    const items = (data.items || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      image: p.images?.[0]?.url || null,
      owner: p.owner?.display_name || '',
      trackCount: p.tracks?.total || 0,
    }));
    playlists.push(...items);
    if (!data.next) break;
    offset += limit;
  }

  return playlists;
}

// --- Fetch all tracks for a playlist ---

async function fetchPlaylistTracks(playlistId, accessToken) {
  const tracks = [];
  const seen = new Set();
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await spotifyGet(
      `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
      accessToken,
    );

    for (const item of data.items || []) {
      if (!item.track || !item.track.id || seen.has(item.track.id)) continue;
      seen.add(item.track.id);
      tracks.push({
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists.map((a) => a.name).join(', '),
        album: item.track.album.name,
        albumImage: item.track.album.images?.[0]?.url || null,
        uri: item.track.uri,
        durationMs: item.track.duration_ms,
      });
    }

    if (!data.next) break;
    offset += limit;
  }

  return tracks;
}

// --- Fetch playlist metadata ---

async function fetchPlaylistMeta(playlistId, accessToken) {
  const data = await spotifyGet(`/playlists/${playlistId}?fields=id,name,description,images,owner`, accessToken);
  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    images: data.images || [],
    owner: data.owner,
  };
}

// --- Main ---

async function cacheAllPlaylists() {
  const startTime = Date.now();
  console.log(`\n========================================`);
  console.log(`📦 Playlist Cache START — ${new Date(startTime).toISOString()}`);
  console.log(`========================================`);

  const userFiles = getUserFiles();
  if (userFiles.length === 0) {
    console.log('No users found.');
    return;
  }

  // Collect playlists from all users, cache per-user playlist lists
  const allPlaylistIds = new Set();
  let validToken = null;

  for (const filePath of userFiles) {
    const userData = readJson(filePath);
    console.log(`\n  👤 ${userData.displayName} (${userData.userId})`);

    try {
      await ensureValidToken(userData);
      writeJson(filePath, userData); // persist refreshed token
      validToken = userData.tokens.accessToken;
    } catch (err) {
      console.error(`    ❌ Token refresh failed: ${err.message}`);
      continue;
    }

    try {
      const playlists = await fetchUserPlaylists(userData.tokens.accessToken);
      console.log(`    📋 Found ${playlists.length} playlists`);

      writeJson(path.join(CACHE_DIR, `user_${userData.userId}_playlists.json`), {
        userId: userData.userId,
        playlists,
        cachedAt: new Date().toISOString(),
      });

      for (const p of playlists) allPlaylistIds.add(p.id);
    } catch (err) {
      console.error(`    ❌ Failed to fetch playlists: ${err.message}`);
    }
  }

  // Cache tracks for each unique playlist (global)
  console.log(`\n  🎵 Caching tracks for ${allPlaylistIds.size} unique playlists...`);

  const realTrackCounts = {};

  for (const playlistId of allPlaylistIds) {
    try {
      const [meta, tracks] = await Promise.all([
        fetchPlaylistMeta(playlistId, validToken),
        fetchPlaylistTracks(playlistId, validToken),
      ]);

      writeJson(path.join(CACHE_DIR, `playlist_${playlistId}.json`), {
        ...meta,
        tracks,
        cachedAt: new Date().toISOString(),
      });

      realTrackCounts[playlistId] = tracks.length;
      console.log(`    ✅ ${meta.name}: ${tracks.length} tracks`);
    } catch (err) {
      console.error(`    ❌ playlist ${playlistId}: ${err.message}`);
    }
  }

  // Update per-user playlist caches with real track counts
  for (const filePath of userFiles) {
    const userData = readJson(filePath);
    const cacheFile = path.join(CACHE_DIR, `user_${userData.userId}_playlists.json`);
    if (!fs.existsSync(cacheFile)) continue;

    const cached = readJson(cacheFile);
    let updated = false;
    for (const p of cached.playlists) {
      if (realTrackCounts[p.id] !== undefined && p.trackCount !== realTrackCounts[p.id]) {
        p.trackCount = realTrackCounts[p.id];
        updated = true;
      }
    }
    if (updated) writeJson(cacheFile, cached);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`📦 Playlist Cache END — ${new Date().toISOString()} (${elapsed}s)`);
  console.log(`========================================\n`);
}

cacheAllPlaylists();
