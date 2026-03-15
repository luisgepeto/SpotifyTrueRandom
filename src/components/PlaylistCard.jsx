import './PlaylistCard.css';

export default function PlaylistCard({ playlist, onClick }) {
  const image = playlist.image || playlist.images?.[0]?.url;
  const trackCount = playlist.trackCount ?? playlist.tracks?.total ?? 0;

  return (
    <div className="playlist-card" onClick={onClick}>
      <div className="card-image">
        {image ? (
          <img src={image} alt={playlist.name} />
        ) : (
          <div className="card-placeholder">🎵</div>
        )}
      </div>
      <div className="card-info">
        <h3 className="card-title">{playlist.name}</h3>
        <p className="card-meta">{trackCount} songs</p>
      </div>
    </div>
  );
}
