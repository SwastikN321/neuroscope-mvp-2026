import { AnnotationImport } from './AnnotationImport';
import { useEffect, useRef } from 'react';
import type { AnnotationController } from './useAnnotations';
import type { EEGAnnotation } from './annotations';
import { channelClock, type EEGRecording } from './recording';

export function AnnotationPanel({
  recording,
  annotations: a,
  onJump,
}: {
  recording: EEGRecording;
  annotations: AnnotationController;
  onJump: (item: EEGAnnotation) => void;
}) {
  const panel = useRef<HTMLDetailsElement>(null);
  const label = useRef<HTMLInputElement>(null);
  const editing = a.draft !== null;
  const editId = a.draft?.id;
  useEffect(() => {
    if (editing) {
      panel.current!.open = true;
      // Do not move the page during touch pointer-up: its following click can
      // otherwise land on the now-moved details summary and close the editor.
      if (a.editFocus) {
        label.current?.focus({ preventScroll: true });
        panel.current?.scrollIntoView({
          block: 'nearest',
          behavior: 'instant',
        });
      }
    } else if (a.selected) {
      panel.current
        ?.querySelector<HTMLButtonElement>(
          `[data-annotation-id="${a.selected}"] button`,
        )
        ?.focus({ preventScroll: true });
    }
  }, [editing, editId, a.selected, a.editFocus]);
  const d = a.draft;
  const channel = (id: string | null) =>
    id
      ? (recording.channels.find((c) => c.id === id)?.label ?? id)
      : 'All channels';
  return (
    <details ref={panel} className="eeg-annotations" open>
      <summary>
        Annotations <span>{a.items.length} in session</span>
      </summary>
      <p className="eeg-annotation-notice">
        Session only · Not permanently saved. Refresh, leaving the workspace,
        switching or removing recordings discards annotations. Temporary EDF
        expiry also clears them. Export JSON to keep a portable copy and import
        it later.
      </p>
      <AnnotationImport recording={recording} annotations={a} />
      {d && (
        <form
          className="eeg-annotation-editor"
          onSubmit={(event) => {
            event.preventDefault();
            a.save(d);
          }}
          aria-label="Annotation editor"
        >
          <div className="eeg-annotation-fields">
            <label>
              Type
              <select
                aria-label="Annotation type"
                value={d.type}
                onChange={(e) =>
                  a.change({
                    ...d,
                    type: e.target.value as 'point' | 'interval',
                    endTime:
                      e.target.value === 'interval'
                        ? Math.min(recording.durationSeconds, d.startTime + 1)
                        : undefined,
                  })
                }
              >
                <option value="point">Point</option>
                <option value="interval">Interval</option>
              </select>
            </label>
            <label>
              Association
              <select
                aria-label="Annotation channel"
                value={d.channelId ?? ''}
                onChange={(e) =>
                  a.change({ ...d, channelId: e.target.value || null })
                }
              >
                <option value="">All channels · exact seconds</option>
                {recording.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {channelClock(recording, c.id).sampleRateHz} Hz
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start (s)
              <input
                aria-label="Annotation start seconds"
                type="number"
                step="any"
                required
                min="0"
                max={recording.durationSeconds}
                value={Number.isFinite(d.startTime) ? d.startTime : ''}
                onChange={(e) =>
                  a.change({ ...d, startTime: e.target.valueAsNumber })
                }
              />
            </label>
            {d.type === 'interval' && (
              <label>
                End (s)
                <input
                  aria-label="Annotation end seconds"
                  type="number"
                  step="any"
                  required
                  min="0"
                  max={recording.durationSeconds}
                  value={Number.isFinite(d.endTime) ? d.endTime : ''}
                  onChange={(e) =>
                    a.change({ ...d, endTime: e.target.valueAsNumber })
                  }
                />
              </label>
            )}
          </div>
          <p>
            {d.channelId
              ? `On save, boundaries snap to the original ${channelClock(recording, d.channelId).sampleRateHz} Hz channel clock.`
              : 'Recording-wide times are stored in seconds without sample snapping.'}{' '}
            Intervals include start and exclude end.
          </p>
          <label>
            Observation label
            <input
              ref={label}
              aria-label="Annotation label"
              value={d.label}
              required
              maxLength={120}
              placeholder="Describe your observation"
              onChange={(e) => a.change({ ...d, label: e.target.value })}
            />
          </label>
          <label>
            Notes (optional)
            <textarea
              aria-label="Annotation notes"
              value={d.notes}
              rows={2}
              maxLength={4000}
              onChange={(e) => a.change({ ...d, notes: e.target.value })}
            />
          </label>
          {a.error && <p role="alert">{a.error}</p>}
          <div className="eeg-annotation-actions">
            <button type="submit">
              {d.id ? 'Update annotation' : 'Save in session'}
            </button>
            <button type="button" onClick={a.cancel}>
              Cancel edit
            </button>
          </div>
        </form>
      )}
      {a.items.length === 0 ? (
        <p>
          No annotations yet. Use Annotate mode, or add a point or interval with
          the time fields.
        </p>
      ) : (
        <ol
          className="eeg-annotation-list"
          aria-label="Annotations sorted by time"
        >
          {a.items.map((item) => (
            <li
              key={item.id}
              data-annotation-id={item.id}
              data-start-time={item.startTime}
              data-end-time={item.endTime}
              data-channel-id={item.channelId ?? ''}
              className={a.selected === item.id ? 'is-selected' : ''}
            >
              <button
                className="eeg-annotation-select"
                aria-pressed={a.selected === item.id}
                onClick={() => a.select(item)}
              >
                <strong>{item.label}</strong>
                <span>
                  {item.type === 'point' ? '◆' : '▰'}{' '}
                  {Number(item.startTime.toFixed(9))} s
                  {item.endTime !== undefined
                    ? ` – ${Number(item.endTime.toFixed(9))} s`
                    : ''}{' '}
                  · {channel(item.channelId)}
                </span>
              </button>
              {item.notes && <p>{item.notes}</p>}
              <div className="eeg-annotation-actions">
                <button
                  aria-label={`Jump to ${item.label}`}
                  onClick={() => onJump(item)}
                >
                  Jump to time
                </button>
                <button
                  aria-label={`Edit ${item.label}`}
                  onClick={() => a.select(item)}
                >
                  Edit
                </button>
                <button
                  aria-label={`Delete ${item.label}`}
                  onClick={() => a.remove(item.id)}
                >
                  Delete
                </button>
              </div>
              {a.selected === item.id && (
                <small>
                  Created {item.createdAt} · Modified {item.modifiedAt}
                </small>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
