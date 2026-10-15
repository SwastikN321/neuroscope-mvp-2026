import { formatTime, type EEGRecording } from './recording';
export function ChannelPanel({
  recording,
  visible,
  onChange,
}: {
  recording: EEGRecording;
  visible: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <aside className="eeg-channels" aria-label="Channel controls">
      <div className="eeg-recording-card">
        <span className="eeg-kicker">DEMO RECORDING</span>
        <h2>{recording.name}</h2>
        <p>{recording.id}</p>
        <span className="eeg-tag">
          Synthetic · {formatTime(recording.durationSeconds).slice(0, 5)}
        </span>
      </div>
      <details open className="eeg-channel-details">
        <summary>
          Channels{' '}
          <span>
            {visible.length} / {recording.channels.length}
          </span>
        </summary>
        <div className="eeg-channel-actions">
          <button onClick={() => onChange(recording.channels.map((c) => c.id))}>
            Select all
          </button>
          <button onClick={() => onChange([])}>Deselect all</button>
        </div>
        <div className="eeg-channel-list">
          {recording.channels.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                aria-label={`${c.label} ${c.region}`}
                checked={visible.includes(c.id)}
                onChange={() =>
                  onChange(
                    visible.includes(c.id)
                      ? visible.filter((id) => id !== c.id)
                      : recording.channels
                          .filter(
                            (ch) => ch.id === c.id || visible.includes(ch.id),
                          )
                          .map((ch) => ch.id),
                  )
                }
              />
              <i style={{ background: c.color }} />
              <strong>{c.label}</strong>
              <span>{c.region}</span>
            </label>
          ))}
        </div>
      </details>
      <p className="eeg-sidebar-note">
        A reproducible sample for exploring the viewer. No patient recordings.
      </p>
    </aside>
  );
}
