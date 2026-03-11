import { getValidToken, refreshAccessToken } from './auth.js';

const BASE_URL = 'https://api.spotify.com/v1';

async function getAccessToken() {
  let token = getValidToken();
  if (!token) {
    const newTokens = await refreshAccessToken();
    token = newTokens.accessToken;
  }
  return token;
}

async function spotifyFetch(endpoint, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    // Token expired, try refresh once
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
  return spotifyFetch(`/playlists/${playlistId}`);
}

export async function getPlaylistTracks(playlistId, limit = 100, offset = 0) {
  return spotifyFetch(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
}

export async function getAllPlaylistTracks(playlistId) {
  const tracks = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await getPlaylistTracks(playlistId, limit, offset);
    const validTracks = data.items
      .filter((item) => item.track && item.track.id)
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

  // Deduplicate by track ID (playlists can have the same song added multiple times)
  const seen = new Set();
  return tracks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
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

export async function getRecentlyPlayed(limit = 50, after = null) {
  let endpoint = `/me/player/recently-played?limit=${limit}`;
  if (after) endpoint += `&after=${after}`;
  return spotifyFetch(endpoint);
}
