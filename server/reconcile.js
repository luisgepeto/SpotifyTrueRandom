import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours
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

  const since = userData.lastReconciled || (Date.now() - DEFAULT_LOOKBACK_MS);
  console.log(`    Looking back to: ${new Date(since).toISOString()}`);

  let items;
  try {
    items = await fetchAllRecentlyPlayed(userData.tokens.accessToken, since);
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      // Retry once after refresh
      try {
        await refreshAccessToken(userData);
        items = await fetchAllRecentlyPlayed(userData.tokens.accessToken, since);
      } catch (retryErr) {
        console.error(`    ❌ Failed after token retry: ${retryErr.message}`);
        saveUserData(filePath, userData); // Save refreshed tokens
        return;
      }
    } else {
      console.error(`    ❌ API error: ${err.message}`);
      return;
    }
  }

  if (items.length === 0) {
    console.log('    No new plays found.');
    userData.lastReconciled = Date.now();
    saveUserData(filePath, userData);
    return;
  }

  // Count plays per track
  const playCounts = {};
  for (const item of items) {
    const trackId = item.track?.id;
    if (!trackId) continue;
    if (!playCounts[trackId]) {
      playCounts[trackId] = {
        count: 0,
        name: item.track.name,
        artist: item.track.artists?.map((a) => a.name).join(', ') || 'Unknown',
      };
    }
    playCounts[trackId].count += 1;
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
    totalReconciled += info.count;
  }

  // Update lastReconciled to most recent played_at
  const mostRecent = items.reduce((latest, item) => {
    const t = new Date(item.played_at).getTime();
    return t > latest ? t : latest;
  }, since);
  userData.lastReconciled = mostRecent;

  saveUserData(filePath, userData);

  const uniqueTracks = Object.keys(playCounts).length;
  console.log(`    ✅ Reconciled ${totalReconciled} plays across ${uniqueTracks} tracks.`);
  console.log(`    📊 Total unique tracks: ${Object.keys(userData.tracks).length}`);
}

// --- Main ---

export async function reconcileAllUsers() {
  const files = getUserFiles();

  if (files.length === 0) {
    console.log('No users found. Run "npm run auth" to add a user.');
    return;
  }

  console.log(`\n🎵 TrueRandom Reconciliation — ${new Date().toISOString()}`);
  console.log(`   Found ${files.length} user(s)`);

  for (const filePath of files) {
    try {
      await reconcileUser(filePath);
    } catch (err) {
      console.error(`  ❌ Error processing ${path.basename(filePath)}: ${err.message}`);
    }
  }

  console.log('\n✅ Reconciliation complete.\n');
}

// Run directly if executed as a script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  reconcileAllUsers();
}
