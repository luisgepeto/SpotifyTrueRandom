import { getValidToken, refreshAccessToken } from './auth.js';

const BASE_URL = 'https://api.spotify.com/v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(`sp_cache_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(`sp_cache_${key}`);
      return null;
    }
    return data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(`sp_cache_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full — ignore */ }
}

async function getAccessToken() {
  let token = getValidToken();
  if (!token) {
    const newTokens = await refreshAccessToken();
    token = newTokens.accessToken;
  }
  return token;
}

async function spotifyFetch(endpoint, options = {}, _retries = 0) {
  const MAX_RETRIES = 5;
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    const newTokens = await refreshAccessToken();
    const retryResponse = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${newTokens.accessToken}`,
        ...options.headers,
      },
    });
    if (!retryResponse.ok) throw new Error(`Spotify API error: ${retryResponse.status}`);
    if (retryResponse.status === 204) return null;
    return retryResponse.json();
  }

  if (response.status === 429) {
    if (_retries >= MAX_RETRIES) throw new Error('Spotify rate limit exceeded after retries');
    const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
    const delay = Math.max(retryAfter, 1) * 1000;
    console.warn(`Rate limited (429). Retrying in ${delay}ms (attempt ${_retries + 1}/${MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, delay));
    return spotifyFetch(endpoint, options, _retries + 1);
  }

  if (!response.ok) throw new Error(`Spotify API error: ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

export async function getProfile() {
  return spotifyFetch('/me');
}

export async function getPlaylists(limit = 50, offset = 0) {
  return spotifyFetch(`/me/playlists?limit=${limit}&offset=${offset}`);
}

export async function getPlaylist(playlistId) {
  const cached = cacheGet(`pl_${playlistId}`);
  if (cached) return cached;
  const data = await spotifyFetch(`/playlists/${playlistId}`);
  cacheSet(`pl_${playlistId}`, data);
  return data;
}

export async function getPlaylistTracks(playlistId, limit = 100, offset = 0) {
  return spotifyFetch(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
}

export async function getAllPlaylistTracks(playlistId) {
  const cached = cacheGet(`plt_${playlistId}`);
  if (cached) return cached;

  const tracks = [];
  const seen = new Set();
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await getPlaylistTracks(playlistId, limit, offset);
    const validTracks = data.items
      .filter((item) => {
        if (!item.track || !item.track.id || seen.has(item.track.id)) return false;
        seen.add(item.track.id);
        return true;
      })
      .map((item) => ({
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists.map((a) => a.name).join(', '),
        album: item.track.album.name,
        albumImage: item.track.album.images?.[0]?.url || null,
        uri: item.track.uri,
        durationMs: item.track.duration_ms,
      }));

    tracks.push(...validTracks);

    if (!data.next) break;
    offset += limit;
  }

  cacheSet(`plt_${playlistId}`, tracks);
  return tracks;
}

export async function getDevices() {
  const data = await spotifyFetch('/me/player/devices');
  return data.devices || [];
}

export async function getCurrentPlayback() {
  return spotifyFetch('/me/player');
}

export async function playTrack(trackUri, deviceId) {
  const body = { uris: [trackUri] };
  const endpoint = deviceId
    ? `/me/player/play?device_id=${deviceId}`
    : '/me/player/play';

  return spotifyFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function pausePlayback() {
  return spotifyFetch('/me/player/pause', { method: 'PUT' });
}

export async function resumePlayback() {
  return spotifyFetch('/me/player/play', { method: 'PUT' });
}

export async function transferPlayback(deviceId) {
  return spotifyFetch('/me/player', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId] }),
  });
}

export async function addToQueue(trackUri, deviceId) {
  const endpoint = deviceId
    ? `/me/player/queue?uri=${encodeURIComponent(trackUri)}&device_id=${deviceId}`
    : `/me/player/queue?uri=${encodeURIComponent(trackUri)}`;
  return spotifyFetch(endpoint, { method: 'POST' });
}

export async function getQueue() {
  return spotifyFetch('/me/player/queue');
}

