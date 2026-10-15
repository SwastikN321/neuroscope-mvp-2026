import { formatTime, type EEGRecording, type TimeRange } from './recording';
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
            <dd className="eeg-accent">Synthetic demo</dd>
          </div>
          <div>
            <dt>Sampling frequency</dt>
            <dd>{recording.sampleRateHz} Hz</dd>
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
            <dd>{recording.sampleCount.toLocaleString('en-US')}</dd>
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
          <h3>About this sample</h3>
          <p>
            Overlapping frequency components, changing envelopes, and seeded
            noise. Labels follow EEG channel naming conventions.
          </p>
          <p>
            Independent synthetic potentials; no acquisition reference or
            clinical montage. Positive voltage plots upward.
          </p>
        </div>
      </details>
      <p className="eeg-synthetic-notice">
        SYNTHETIC DATA ONLY
        <br />
        <span>For demonstration. Not for clinical use.</span>
      </p>
    </aside>
  );
}
