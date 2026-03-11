import { useState } from 'react';
import { pausePlayback, resumePlayback } from '../lib/spotify.js';
import { skipTrack, previousTrack, isPlaybackActive } from '../lib/playback.js';
import './Player.css';

export default function Player({ currentTrack, deviceId }) {
  const active = isPlaybackActive();
  const [isPlaying, setIsPlaying] = useState(true);

  if (!active || !currentTrack) return null;

  const handlePlayPauseToggle = async () => {
    try {
      if (isPlaying) {
        await pausePlayback();
        setIsPlaying(false);
      } else {
        await resumePlayback();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Play/Pause toggle error:', err);
    }
  };

  const handlePrevious = () => {
    previousTrack(deviceId);
    setIsPlaying(true);
  };

  const handleSkip = () => {
    skipTrack(deviceId);
    setIsPlaying(true);
  };

  return (
    <div className="player-bar">
      <div className="player-left">
        {currentTrack.albumImage && (
          <img
            className="player-art"
            src={currentTrack.albumImage}
            alt={currentTrack.album}
          />
        )}
        <div className="player-info">
          <span className="player-name">{currentTrack.name}</span>
          <span className="player-artist">{currentTrack.artist}</span>
        </div>
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button className="ctrl-btn" onClick={handlePrevious} title="Previous">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H2.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h.6z"/></svg>
          </button>
          <button
            className="ctrl-btn play-pause"
            onClick={handlePlayPauseToggle}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"/></svg>
            ) : (
              <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
            )}
          </button>
          <button className="ctrl-btn" onClick={handleSkip} title="Next">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-.6z"/></svg>
          </button>
        </div>
        <span className="player-hint">Volume & seek controlled via Spotify app</span>
      </div>

      <div className="player-right">
        <span className="player-badge">🎲 TrueRandom</span>
      </div>
    </div>
  );
}
