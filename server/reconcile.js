import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const DATA_DIR = path.join(__dirname, 'data');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const MIN_LOOKBACK_MS = 3 * 60 * 60 * 1000; // minimum 3 hours
const LOOKBACK_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hour buffer past lastReconciled
const MAX_PAGES = 20;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

// --- File helpers ---

function getUserFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(DATA_DIR, f));
}

function readUserData(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function saveUserData(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// --- Token management ---

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
  // Refresh if token expires in less than 60 seconds
  if (!userData.tokens.accessToken || Date.now() > userData.tokens.expiresAt - 60_000) {
    await refreshAccessToken(userData);
  }
}

// --- Spotify API ---

async function spotifyGet(endpoint, accessToken) {
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new Error('TOKEN_EXPIRED');
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${body}`);
  }

  return response.json();
}

async function fetchAllRecentlyPlayed(accessToken, since) {
  const allItems = [];
  let cursor = since;

  for (let page = 0; page < MAX_PAGES; page++) {
    const endpoint = `/me/player/recently-played?limit=50&after=${cursor}`;
    const data = await spotifyGet(endpoint, accessToken);
    const items = data?.items || [];
    allItems.push(...items);

    console.log(`    Page ${page + 1}: ${items.length} items (total: ${allItems.length})`);

    if (items.length < 50) break;

    const nextCursor = data?.cursors?.after;
    if (!nextCursor || nextCursor === String(cursor)) break;
    cursor = Number(nextCursor);
  }

  return allItems;
}

// --- Reconciliation ---

async function reconcileUser(filePath) {
  const userData = readUserData(filePath);
  const { userId, displayName } = userData;

  console.log(`\n  👤 ${displayName} (${userId})`);

  try {
    await ensureValidToken(userData);
  } catch (err) {
    console.error(`    ❌ Token refresh failed: ${err.message}`);
    console.error(`    Run "npm run auth" to re-authorize this user.`);
    return;
  }

  // Look back at least 3h, or to lastReconciled - 2h buffer, whichever is further
  const minLookback = Date.now() - MIN_LOOKBACK_MS;
  const lastReconciledLookback = userData.lastReconciled
    ? userData.lastReconciled - LOOKBACK_BUFFER_MS
    : 0;
  const since = Math.min(minLookback, lastReconciledLookback || minLookback);
  const windowHours = ((Date.now() - since) / 3600000).toFixed(1);
  console.log(`    Window: ${new Date(since).toISOString()} → ${new Date().toISOString()} (${windowHours}h)`);

  let items;
  try {
    items = await fetchAllRecentlyPlayed(userData.tokens.accessToken, since);
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      try {
        await refreshAccessToken(userData);
        items = await fetchAllRecentlyPlayed(userData.tokens.accessToken, since);
      } catch (retryErr) {
        console.error(`    ❌ Failed after token retry: ${retryErr.message}`);
        saveUserData(filePath, userData);
        return;
      }
    } else {
      console.error(`    ❌ API error: ${err.message}`);
      return;
    }
  }

  // Deduplicate against previously reconciled plays using trackId:played_at
  const previouslySeen = new Set(userData.reconciledPlays || []);
  const newItems = items.filter((item) => {
    const key = `${item.track?.id}:${item.played_at}`;
    return !previouslySeen.has(key);
  });

  console.log(`    API returned ${items.length} items, ${newItems.length} are new`);

  // Update reconciledPlays: keep keys from this window + new ones
  const cutoff = new Date(since).toISOString();
  const updatedSeen = [...previouslySeen]
    .filter((key) => key.split(':').slice(1).join(':') >= cutoff);
  for (const item of newItems) {
    updatedSeen.push(`${item.track?.id}:${item.played_at}`);
  }
  userData.reconciledPlays = updatedSeen;

  if (newItems.length === 0) {
    console.log('    No new plays found.');
    userData.lastReconciled = Date.now();
    userData.lastReconciledAt = new Date().toISOString();
    saveUserData(filePath, userData);
    return;
  }

  // Count plays per track (only new items)
  const playCounts = {};
  for (const item of newItems) {
    const trackId = item.track?.id;
    if (!trackId) continue;
    if (!playCounts[trackId]) {
      playCounts[trackId] = {
        count: 0,
        name: item.track.name,
        artist: item.track.artists?.map((a) => a.name).join(', ') || 'Unknown',
        lastPlayedAt: item.played_at,
      };
    }
    playCounts[trackId].count += 1;
    if (item.played_at > playCounts[trackId].lastPlayedAt) {
      playCounts[trackId].lastPlayedAt = item.played_at;
    }
  }

  // Update user's track stats
  if (!userData.tracks) userData.tracks = {};
  let totalReconciled = 0;

  for (const [trackId, info] of Object.entries(playCounts)) {
    if (!userData.tracks[trackId]) {
      userData.tracks[trackId] = { playCount: 0, name: info.name, artist: info.artist };
    }
    userData.tracks[trackId].playCount += info.count;
    userData.tracks[trackId].name = info.name;
    userData.tracks[trackId].artist = info.artist;
    if (!userData.tracks[trackId].lastPlayedAt || info.lastPlayedAt > userData.tracks[trackId].lastPlayedAt) {
      userData.tracks[trackId].lastPlayedAt = info.lastPlayedAt;
    }
    totalReconciled += info.count;
  }

  // Update lastReconciled to now
  userData.lastReconciled = Date.now();
  userData.lastReconciledAt = new Date().toISOString();

  saveUserData(filePath, userData);

  const uniqueTracks = Object.keys(playCounts).length;
  console.log(`    ✅ Reconciled ${totalReconciled} plays across ${uniqueTracks} tracks.`);
  console.log(`    📊 Total unique tracks: ${Object.keys(userData.tracks).length}`);
}

// --- Main ---

export async function reconcileAllUsers() {
  const startTime = Date.now();
  console.log(`\n========================================`);
  console.log(`🎵 Reconciliation START — ${new Date(startTime).toISOString()}`);
  console.log(`========================================`);

  const files = getUserFiles();

  if (files.length === 0) {
    console.log('No users found. Run "npm run auth" to add a user.');
    console.log(`🏁 Reconciliation END — ${new Date().toISOString()} (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`);
    return;
  }

  console.log(`   Found ${files.length} user(s)`);

  for (const filePath of files) {
    try {
      await reconcileUser(filePath);
    } catch (err) {
      console.error(`  ❌ Error processing ${path.basename(filePath)}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`🏁 Reconciliation END — ${new Date().toISOString()} (${elapsed}s)`);
  console.log(`========================================\n`);
}

// Run directly if executed as a script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  reconcileAllUsers();
}
