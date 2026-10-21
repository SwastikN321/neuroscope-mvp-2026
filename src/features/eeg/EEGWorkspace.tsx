import { ExportPanel } from './ExportPanel';
import { useAnnotations } from './useAnnotations';
import { AnnotationPanel } from './AnnotationPanel';
import type { EEGAnnotation } from './annotations';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  onAnnotationDirtyChange,
}: {
  source: EEGDataSource;
  recordingControls?: ReactNode;
  onAnnotationDirtyChange?: (dirty: boolean) => void;
}) {
  const viewer = useRef<HTMLElement>(null);
  const recording = source.recording;
  const annotations = useAnnotations(recording, onAnnotationDirtyChange);
  const [visible, setVisible] = useState(() =>
    recording.channels
      .slice(0, recording.source === 'edf' ? 12 : undefined)
      .map((c) => c.id),
  );
  const [channelPage, setChannelPage] = useState(0);
  const page = Math.min(
    channelPage,
    Math.max(0, Math.ceil(visible.length / 32) - 1),
  );
  const viewIds = useMemo(
    () => visible.slice(page * 32, (page + 1) * 32),
    [visible, page],
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
  const window = useRecordingWindow(source, range, viewIds, retry);
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
    viewIds.includes(probe.channelId) &&
    !window.pending &&
    !window.error
      ? sampleValue(window.data, probe.channelId, probe.sample)
      : undefined;
  useEffect(() => {
    if (
      !probe ||
      loadedValue !== undefined ||
      !source.readSample ||
      !viewIds.includes(probe.channelId) ||
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
    viewIds,
    window.pending,
    window.error,
  ]);
  const value =
    loadedValue ??
    (!window.pending &&
    !window.error &&
    probe &&
    viewIds.includes(probe.channelId) &&
    exact?.key === probeKey
      ? exact.value
      : undefined);
  const clipped = useMemo(
    () =>
      viewIds.filter((id) =>
        window.data?.channels[id]?.some((v) => Math.abs(v) > amplitude),
      ).length,
    [viewIds, window.data, amplitude],
  );
  const displayedChannel =
    probe && viewIds.includes(probe.channelId)
      ? probe.channelId
      : viewIds[0] || '';
  const clock = channelClock(recording, displayedChannel);
  function jumpToAnnotation(item: EEGAnnotation) {
    if (item.channelId) {
      const next = visible.includes(item.channelId)
        ? visible
        : [...visible, item.channelId];
      setVisible(next);
      setChannelPage(Math.floor(next.indexOf(item.channelId) / 32));
    }
    const plot = viewer.current?.querySelector<HTMLElement>('.eeg-plot');
    plot?.scrollIntoView({ block: 'center', behavior: 'instant' });
    plot?.focus({ preventScroll: true });
    const targetSpan = Math.max(
      span,
      (item.endTime ?? item.startTime) - item.startTime + 1,
    );
    setRange(
      constrainRange(
        item.startTime - targetSpan * 0.15,
        targetSpan,
        recording.durationSeconds,
      ),
    );
  }
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
          ref={viewer}
          className="eeg-viewer"
          aria-label="Signal explorer controls and waveforms"
        >
          <div className="eeg-viewer-heading">
            <div>
              <i />
              <strong>Multichannel view</strong>
              <span>
                {viewIds.length} channels
                {visible.length > 32 ? ` / ${visible.length} selected` : ''}
              </span>
            </div>
            <span>{rateLabel(recording)} · µV</span>
          </div>
          {visible.length > 32 && (
            <nav className="eeg-channel-pages" aria-label="Channel pages">
              <button
                disabled={page === 0}
                onClick={() => setChannelPage(page - 1)}
              >
                Previous channels
              </button>
              <span>
                Channels {page * 32 + 1}–
                {Math.min(visible.length, (page + 1) * 32)} of {visible.length}{' '}
                selected
              </span>
              <button
                disabled={(page + 1) * 32 >= visible.length}
                onClick={() => setChannelPage(page + 1)}
              >
                Next channels
              </button>
            </nav>
          )}
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
          <div
            className="eeg-annotation-tools"
            role="group"
            aria-label="Waveform interaction mode"
          >
            <button
              aria-pressed={annotations.mode === 'navigate'}
              onClick={() => annotations.setMode('navigate')}
            >
              Navigate
            </button>
            <button
              aria-pressed={annotations.mode === 'annotate'}
              onClick={() => annotations.setMode('annotate')}
            >
              Annotate
            </button>
            <span>
              {annotations.mode === 'annotate'
                ? 'Click for a point · Drag for an interval · Native channel timing'
                : 'Drag to pan · Tap to inspect'}
            </span>
            <button
              onClick={() =>
                annotations.begin({
                  type: 'point',
                  startTime: probe
                    ? probe.sample /
                      channelClock(recording, probe.channelId).sampleRateHz
                    : range.start,
                  channelId: displayedChannel || null,
                })
              }
            >
              Add point
            </button>
            <button
              onClick={() =>
                annotations.begin({
                  type: 'interval',
                  startTime: range.start,
                  endTime: range.end,
                  channelId: displayedChannel || null,
                })
              }
            >
              Add interval
            </button>
          </div>
          {annotations.draft && !annotations.editFocus && (
            <div className="eeg-annotation-selection-ready" role="status">
              Selection ready · review times and add a label{' '}
              <button onClick={annotations.focusEditor}>Edit selection</button>
            </div>
          )}
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
              ids={viewIds}
              amplitude={amplitude}
              probe={probe}
              onProbe={inspect}
              onRange={setRange}
              onReset={reset}
              annotationMode={annotations.mode === 'annotate'}
              annotations={annotations.items}
              selectedAnnotation={annotations.selected}
              annotationDraft={annotations.draft}
              onAnnotationCreate={(selection) =>
                annotations.begin(selection, false)
              }
              onAnnotationSelect={annotations.select}
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
                {viewIds.map((id) => (
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
                  probe && viewIds.includes(probe.channelId)
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
              {annotations.mode === 'annotate'
                ? 'Annotate: click or drag to select · Use Add point / Add interval for keyboard entry · '
                : 'Drag to pan · Tap or hover to inspect · '}
              ← → pan · + − zoom · Shift + ← → inspect samples · ↑ ↓ channels ·
              Home reset
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
          <ExportPanel
            source={source}
            data={window.data}
            ids={viewIds}
            range={range}
            amplitude={amplitude}
            annotations={annotations}
            pending={window.pending || !!window.error}
          />
          <AnnotationPanel
            recording={recording}
            annotations={annotations}
            onJump={jumpToAnnotation}
          />
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
          count={viewIds.length}
        />
      </div>
      <footer className="eeg-footer">
        <span>NEUROSCOPE / RESEARCH PREVIEW</span>
        <span>Local research visualization. Not for clinical use.</span>
      </footer>
    </div>
  );
}
