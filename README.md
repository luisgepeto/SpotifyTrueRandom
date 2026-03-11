# 🎲 TrueRandom for Spotify

Play your Spotify playlists with a truly uniform distribution. Every song gets played roughly the same number of times over time.

## What is TrueRandom?

Unlike Spotify's **Shuffle** mode (which randomizes songs independently on each playback), **TrueRandom** keeps a per-song play count and prioritizes the least-played songs using a **weighted random** algorithm.

## Features

- 🔗 **Spotify Login** via OAuth PKCE (no server required)
- 📋 **Browse playlists** from your account
- 🎲 **TrueRandom mode** — balanced playback with weighted random
- 📊 **Per-song statistics** tracked per playlist
- ⚙️ **Adjustable tolerance** — control how strict the balancing is
- 🧹 **Clear statistics** — start fresh at any time
- 🐛 **Debug mode** — detailed algorithm logs in the browser console
- 🔊 **Spotify Connect** — control playback on any device (phone, speaker, etc.)

## Requirements

- A **Spotify Premium** account
- A **Spotify App** registered at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

## Setup

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Under **Redirect URIs**, add: `https://localhost:5173/` (development) and your production URL
4. Copy the **Client ID**

### 2. Configure the project

```bash
git clone <repo-url>
cd TrueRandom
cp .env.example .env
```

Edit `.env` and add your Client ID:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open `https://localhost:5173` in your browser.

## TrueRandom Algorithm

1. Calculate the **average** play count across all songs
2. Calculate the **threshold** = average + tolerance
3. Select **candidates**: songs with play count < threshold
4. Assign **weights**: weight = threshold − play count (further behind = higher probability)
5. **Weighted random** pick among candidates
6. Play the song and increment its count

### Edge Cases

- **New song**: Initialized at the current average (doesn't need to "catch up")
- **Removed song**: Ignored — doesn't affect the average
- **Per-playlist counts**: A song in multiple playlists has independent play counts

## Deploy to GitHub Pages

```bash
npm run build
```

Output goes to `dist/`. Configure GitHub Pages to serve from that directory, or use GitHub Actions.

## Tech Stack

- React 19 + Vite 7
- React Router (HashRouter)
- Spotify Web API + OAuth PKCE
- localStorage for persistence
- 100% client-side (no server)
