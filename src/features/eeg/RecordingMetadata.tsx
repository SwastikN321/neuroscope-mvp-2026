import {
  rateLabel,
  formatTime,
  type EEGRecording,
  type TimeRange,
} from './recording';
export function RecordingMetadata({
  recording,
  range,
  count,
}: {
  recording: EEGRecording;
  range: TimeRange;
  count: number;
}) {
  return (
    <aside className="eeg-metadata" aria-label="Recording information">
      <details open>
        <summary>Recording details</summary>
        <dl>
          <div>
            <dt>Source</dt>
            <dd className="eeg-accent">
              {recording.source === 'synthetic'
                ? 'Synthetic demo'
                : 'Local EDF'}
            </dd>
          </div>
          <div>
            <dt>Sampling frequency</dt>
            <dd>{rateLabel(recording)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>
              {formatTime(recording.durationSeconds)}{' '}
              <span>({recording.durationSeconds} s)</span>
            </dd>
          </div>
          <div>
            <dt>Channels</dt>
            <dd>
              {recording.channels.length} <span>· {count} visible</span>
            </dd>
          </div>
          <div>
            <dt>Samples / channel</dt>
            <dd>
              {[
                ...new Set(
                  recording.channels.map(
                    (c) => c.sampleCount ?? recording.sampleCount,
                  ),
                ),
              ]
                .map((n) => n.toLocaleString('en-US'))
                .join(' / ')}
            </dd>
          </div>
          <div>
            <dt>Amplitude unit</dt>
            <dd>Microvolts (µV)</dd>
          </div>
        </dl>
        <div className="eeg-range-card">
          <span className="eeg-kicker">VISIBLE TIME RANGE</span>
          <strong data-testid="time-range">
            {formatTime(range.start)} — {formatTime(range.end)}
          </strong>
          <span>{(range.end - range.start).toFixed(2)} seconds displayed</span>
        </div>
        <div className="eeg-method">
          <h3>About this recording</h3>
          <p>{recording.description}</p>
          <p>{recording.reference}</p>
        </div>
      </details>
      <p className="eeg-synthetic-notice">
        {recording.source === 'synthetic'
          ? 'SYNTHETIC DATA ONLY'
          : recording.storage === 'private-cloud'
            ? 'PRIVATE CLOUD RESEARCH DATA'
            : 'LOCAL RESEARCH DATA'}
        <br />
        <span>
          {recording.source === 'synthetic'
            ? 'For demonstration. Not for clinical use.'
            : 'Not for clinical use.'}
        </span>
      </p>
    </aside>
  );
}
