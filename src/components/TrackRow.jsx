import './TrackRow.css';

export default function TrackRow({ track, average, tolerance }) {
  const threshold = average + tolerance;
  const isExcluded = track.playCount >= threshold;
  const diff = track.playCount - average;

  return (
    <div className={`track-row ${isExcluded ? 'excluded' : ''}`}>
      <span className="col-name">{track.name}</span>
      <span className="col-artist">{track.artist}</span>
      <span className="col-count">
        <span className="count-value">{track.playCount}</span>
        <span className={`count-diff ${diff > 0 ? 'above' : diff < 0 ? 'below' : ''}`}>
          {diff > 0 ? `+${diff.toFixed(0)}` : diff < 0 ? diff.toFixed(0) : '±0'}
        </span>
      </span>
    </div>
  );
}
