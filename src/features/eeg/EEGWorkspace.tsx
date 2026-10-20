import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Logo } from '../../components/brand/Logo';
import { ChannelPanel } from './ChannelPanel';
import { RecordingMetadata } from './RecordingMetadata';
import { Timeline } from './Timeline';
import { WaveformViewer, type Probe } from './WaveformViewer';
import { useRecordingWindow } from './useRecordingWindow';
import {
  channelClock,
  rateLabel,
  sampleValue,
  constrainRange,
  formatTime,
  zoomRange,
  type EEGDataSource,
  type TimeRange,
} from './recording';
import './workspace.css';

export function EEGWorkspace({
  source,
  recordingControls,
}: {
  source: EEGDataSource;
  recordingControls?: ReactNode;
}) {
  const recording = source.recording;
  const [visible, setVisible] = useState(() =>
    recording.channels
      .slice(0, recording.source === 'edf' ? 12 : undefined)
      .map((c) => c.id),
  );
  const [range, setRange] = useState<TimeRange>({
    start: 0,
    end: Math.min(10, recording.durationSeconds),
  });
  const [amplitude, setAmplitude] = useState(
    recording.source === 'edf' ? 100 : 50,
  );
  const [probe, setProbe] = useState<Probe | null>(null);
  const [retry, setRetry] = useState(0);
  const window = useRecordingWindow(source, range, visible, retry);
  const span = range.end - range.start;
  function reset() {
    setRange({ start: 0, end: Math.min(10, recording.durationSeconds) });
    setProbe(null);
  }
  function inspect(next: Probe) {
    setProbe(next);
    const time =
      next.sample / channelClock(recording, next.channelId).sampleRateHz;
    if (time < range.start || time > range.end)
      setRange(
        constrainRange(time - span / 2, span, recording.durationSeconds),
      );
  }
  const [exact, setExact] = useState<{ key: string; value: number } | null>(
    null,
  );
  const [probeError, setProbeError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const probeKey = probe ? `${probe.channelId}:${probe.sample}` : '';
  const loadedValue =
    probe &&
    visible.includes(probe.channelId) &&
    !window.pending &&
    !window.error
      ? sampleValue(window.data, probe.channelId, probe.sample)
      : undefined;
  useEffect(() => {
    if (
      !probe ||
      loadedValue !== undefined ||
      !source.readSample ||
      !visible.includes(probe.channelId) ||
      window.pending ||
      window.error
    )
      return;
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      void source.readSample!(probe.channelId, probe.sample, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setExact({ key: probeKey, value });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setProbeError({
              key: probeKey,
              message:
                error instanceof Error
                  ? error.message
                  : 'Unable to inspect this sample.',
            });
        });
    }, 100);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    source,
    probe,
    probeKey,
    loadedValue,
    visible,
    window.pending,
    window.error,
  ]);
  const value =
    loadedValue ??
    (!window.pending &&
    !window.error &&
    probe &&
    visible.includes(probe.channelId) &&
    exact?.key === probeKey
      ? exact.value
      : undefined);
  const clipped = useMemo(
    () =>
      visible.filter((id) =>
        window.data?.channels[id]?.some((v) => Math.abs(v) > amplitude),
      ).length,
    [visible, window.data, amplitude],
  );
  const displayedChannel =
    probe && visible.includes(probe.channelId)
      ? probe.channelId
      : visible[0] || '';
  const clock = channelClock(recording, displayedChannel);
  const synthetic = recording.source === 'synthetic';
  return (
    <div className="eeg-workspace">
      <header className="eeg-header">
        <Link to="/" aria-label="NeuroScope home">
          <Logo />
        </Link>
        <span className="eeg-header-divider" />
        <span className="eeg-header-title">Research workspace</span>
        <nav aria-label="Main navigation">
          <NavLink to="/">Overview</NavLink>
          <NavLink to="/app">Workspace</NavLink>
        </nav>
        <span className="eeg-session">
          <i />
          {synthetic ? 'LOCAL DEMO' : 'LOCAL EDF'}
        </span>
      </header>
      <div className="eeg-page-heading">
        <div>
          <span className="eeg-kicker">RECORDING / {recording.id}</span>
          <h1>
            Signal explorer{' '}
            <span className="eeg-tag">
              {synthetic ? 'Synthetic EEG' : 'Uploaded EDF'}
            </span>
          </h1>
        </div>
        <Link to="/" className="eeg-home-link">
          ← Back to homepage
        </Link>
      </div>
      {recordingControls}
      <div className="eeg-layout">
        <ChannelPanel
          recording={recording}
          visible={visible}
          onChange={setVisible}
        />
        <section
          className="eeg-viewer"
          aria-label="Signal explorer controls and waveforms"
        >
          <div className="eeg-viewer-heading">
            <div>
              <i />
              <strong>Multichannel view</strong>
              <span>{visible.length} channels</span>
            </div>
            <span>{rateLabel(recording)} · µV</span>
          </div>
          <div className="eeg-toolbar">
            <div className="eeg-button-group">
              <button
                aria-label="Pan earlier"
                disabled={range.start <= 0}
                onClick={() =>
                  setRange(
                    constrainRange(
                      range.start - span / 2,
                      span,
                      recording.durationSeconds,
                    ),
                  )
                }
              >
                ←
              </button>
              <button
                aria-label="Pan later"
                disabled={range.end >= recording.durationSeconds}
                onClick={() =>
                  setRange(
                    constrainRange(
                      range.start + span / 2,
                      span,
                      recording.durationSeconds,
                    ),
                  )
                }
              >
                →
              </button>
            </div>
            <div className="eeg-button-group">
              <button
                aria-label="Zoom out"
                disabled={span >= recording.durationSeconds}
                onClick={() =>
                  setRange(zoomRange(range, 2, recording.durationSeconds))
                }
              >
                −
              </button>
              <button
                aria-label="Zoom in"
                disabled={span <= 0.25}
                onClick={() =>
                  setRange(zoomRange(range, 0.5, recording.durationSeconds))
                }
              >
                +
              </button>
            </div>
            <span className="eeg-window-length">
              {span.toFixed(span < 1 ? 2 : 1)} s window
            </span>
            <label>
              Range{' '}
              <select
                aria-label="Amplitude range"
                value={amplitude}
                onChange={(e) => setAmplitude(Number(e.target.value))}
              >
                <option value={50}>±50 µV</option>
                <option value={100}>±100 µV</option>
                <option value={200}>±200 µV</option>
              </select>
            </label>
            <button className="eeg-reset" onClick={reset}>
              Reset view
            </button>
          </div>
          {window.error ? (
            <div className="eeg-load-state" role="alert">
              <h2>Unable to read this window</h2>
              <p>{window.error}</p>
              <button onClick={() => setRetry((n) => n + 1)}>
                Retry recording
              </button>
            </div>
          ) : window.data ? (
            <WaveformViewer
              recording={recording}
              data={window.data}
              range={range}
              ids={visible}
              amplitude={amplitude}
              probe={probe}
              onProbe={inspect}
              onRange={setRange}
              onReset={reset}
            />
          ) : (
            <div className="eeg-load-state" role="status">
              Loading {synthetic ? 'synthetic' : 'EDF'} signal window…
            </div>
          )}
          <div className="eeg-inspector">
            <span className="eeg-kicker">SAMPLE INSPECTOR</span>
            <label>
              Channel{' '}
              <select
                aria-label="Inspect channel"
                disabled={!visible.length}
                value={displayedChannel}
                onChange={(e) =>
                  inspect({
                    channelId: e.target.value,
                    sample: Math.min(
                      channelClock(recording, e.target.value).sampleCount - 1,
                      Math.round(
                        (probe
                          ? probe.sample /
                            channelClock(recording, probe.channelId)
                              .sampleRateHz
                          : range.start) *
                          channelClock(recording, e.target.value).sampleRateHz,
                      ),
                    ),
                  })
                }
              >
                {visible.map((id) => (
                  <option key={id} value={id}>
                    {recording.channels.find((c) => c.id === id)?.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Time{' '}
              <input
                aria-label="Inspect time in seconds"
                type="number"
                min={0}
                max={(clock.sampleCount - 1) / clock.sampleRateHz}
                step={1 / clock.sampleRateHz}
                disabled={!visible.length}
                value={
                  probe && visible.includes(probe.channelId)
                    ? Number((probe.sample / clock.sampleRateHz).toFixed(6))
                    : Number(range.start.toFixed(6))
                }
                onChange={(e) => {
                  const time = e.target.valueAsNumber;
                  if (Number.isFinite(time))
                    inspect({
                      channelId: displayedChannel,
                      sample: Math.max(
                        0,
                        Math.min(
                          clock.sampleCount - 1,
                          Math.round(time * clock.sampleRateHz),
                        ),
                      ),
                    });
                }}
              />{' '}
              s
            </label>
            <output data-testid="amplitude-readout">
              {value === undefined
                ? '— µV'
                : `${value >= 0 ? '+' : ''}${value.toFixed(2)} µV`}
            </output>
          </div>
          {probeError?.key === probeKey && value === undefined && (
            <p className="eeg-inspection-error" role="status">
              {probeError.message}
            </p>
          )}
          <div className="eeg-plot-note">
            <p id="eeg-plot-help">
              Drag to pan · Tap or hover to inspect · ← → pan · + − zoom · Shift
              + ← → inspect samples · ↑ ↓ channels · Home reset
            </p>
            {window.data?.reduced && (
              <span>
                Peak-preserving display envelope. Inspector retrieves the exact
                original sample.
              </span>
            )}
            {clipped > 0 && (
              <span role="status">
                {clipped} channels exceed ±{amplitude} µV. Increase range to see
                peaks.
              </span>
            )}
            {window.pending && window.data && (
              <span role="status">Updating window…</span>
            )}
          </div>
          <Timeline source={source} range={range} onRange={setRange} />
          <div className="eeg-viewer-footer">
            <span>
              Visible {formatTime(range.start)} — {formatTime(range.end)}
            </span>
            <span>
              {synthetic
                ? 'Synthetic recording · no patient data'
                : 'Original EDF measurements · local temporary storage'}
            </span>
          </div>
        </section>
        <RecordingMetadata
          recording={recording}
          range={range}
          count={visible.length}
        />
      </div>
      <footer className="eeg-footer">
        <span>NEUROSCOPE / RESEARCH PREVIEW</span>
        <span>Local research visualization. Not for clinical use.</span>
      </footer>
    </div>
  );
}
