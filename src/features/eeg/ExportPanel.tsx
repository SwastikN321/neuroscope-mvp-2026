import { useEffect, useRef, useState } from 'react';
import type { EEGDataSource, EEGWindow, TimeRange } from './recording';
import type { AnnotationController } from './useAnnotations';
import { annotationJSON } from './annotationPortability';
import { downloadFile, exportFilename, nativeCSV } from './dataExport';
import { visualizationPNG } from './visualizationExport';
export function ExportPanel({
  source,
  data,
  ids,
  range,
  amplitude,
  annotations,
  pending,
}: {
  source: EEGDataSource;
  data?: EEGWindow;
  ids: string[];
  range: TimeRange;
  amplitude: number;
  annotations: AnnotationController;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false),
    [start, setStart] = useState('0'),
    [end, setEnd] = useState('10');
  const [selected, setSelected] = useState(ids),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function run(kind: 'visualization' | 'eeg' | 'annotations') {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(false);
    setMessage('Preparing export…');
    try {
      if (kind === 'eeg' && custom && (!start.trim() || !end.trim()))
        throw new Error('Enter both CSV interval boundaries.');
      const blob =
        kind === 'visualization'
          ? await visualizationPNG({
              recording: source.recording,
              data: data!,
              ids: [...ids],
              range: { ...range },
              amplitude,
              annotations: [...annotations.items],
            })
          : kind === 'annotations'
            ? new Blob([annotationJSON(source.recording, annotations.items)], {
                type: 'application/json',
              })
            : await nativeCSV(
                source,
                selected,
                custom ? { start: Number(start), end: Number(end) } : range,
                controller.signal,
                setMessage,
              );
      controller.signal.throwIfAborted();
      const filename = exportFilename(
        kind,
        kind === 'visualization' ? 'png' : kind === 'eeg' ? 'csv' : 'json',
      );
      downloadFile(blob, filename);
      setMessage(
        `Download requested: ${filename} (${(blob.size / 1024).toFixed(1)} KiB). Check your browser downloads; disk completion cannot be verified here.`,
      );
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(true);
        setMessage(
          failure instanceof Error ? failure.message : 'Export failed.',
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        abort.current = null;
      }
    }
  }
  return (
    <details
      className="eeg-export-panel"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Export <span>PNG · CSV · Annotation JSON</span>
      </summary>
      {open && (
        <>
          <p>
            Downloads stay in your browser. EEG values, channel labels and
            annotation text may be sensitive. Store and share them deliberately.
          </p>
          <div className="eeg-export-actions">
            <button
              disabled={busy || pending || !data || !ids.length}
              onClick={() => void run('visualization')}
            >
              Export Visualization (PNG)
            </button>
            <button disabled={busy} onClick={() => void run('annotations')}>
              Export Annotations (JSON)
            </button>
          </div>
          <p>
            PNG: current {ids.length}-channel page, current time interval and
            saved annotations. 2× resolution; amplitude scale expands if needed
            to fit peaks. JSON: all saved-in-session annotations, including
            those outside this view. Unfinished edits are excluded.
          </p>
          <fieldset disabled={busy}>
            <legend>Export EEG Data (CSV) · original native samples</legend>
            <label>
              Time interval
              <select
                aria-label="CSV interval"
                value={custom ? 'custom' : 'visible'}
                onChange={(e) => {
                  setCustom(e.target.value === 'custom');
                  setStart(String(range.start));
                  setEnd(String(range.end));
                }}
              >
                <option value="visible">Current visible interval</option>
                <option value="custom">Custom bounded interval</option>
              </select>
            </label>
            {custom ? (
              <div className="eeg-export-times">
                <label>
                  Start (s)
                  <input
                    aria-label="CSV start seconds"
                    type="number"
                    step="any"
                    min="0"
                    max={source.recording.durationSeconds}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  End (s)
                  <input
                    aria-label="CSV end seconds"
                    type="number"
                    step="any"
                    min="0"
                    max={source.recording.durationSeconds}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <p>
                {range.start}–{range.end} s · start included, end excluded
              </p>
            )}
            <button onClick={() => setSelected([...ids])}>
              Use visible channels for CSV
            </button>
            <button onClick={() => setSelected([])}>Clear CSV channels</button>
            <div
              className="eeg-export-channels"
              role="group"
              aria-label="CSV channels"
            >
              {source.recording.channels.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, c.id]
                          : old.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <p>
              {selected.length} channels · Channel blocks follow selection
              order. Maximum 60 seconds, 32 channels, 250,000 sample rows, 16
              MiB. No display downsampling, filtering or interpolation.
              Long-form times use each channel’s native clock.
            </p>
            <button onClick={() => void run('eeg')}>
              Export EEG Data (CSV)
            </button>
          </fieldset>
          {busy && (
            <button
              onClick={() => {
                abort.current?.abort();
                setBusy(false);
                setMessage('Export canceled. No download was requested.');
              }}
            >
              Cancel export
            </button>
          )}
          {message && <p role={error ? 'alert' : 'status'}>{message}</p>}
        </>
      )}
    </details>
  );
}
