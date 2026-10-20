import { useEffect, useMemo, useRef, useState } from 'react';
import {
  constrainRange,
  formatTime,
  type EEGDataSource,
  type OverviewBin,
  type TimeRange,
} from './recording';
export function Timeline({
  source,
  range,
  onRange,
}: {
  source: EEGDataSource;
  range: TimeRange;
  onRange: (r: TimeRange) => void;
}) {
  const [overview, setOverview] = useState<OverviewBin[]>([]);
  const [error, setError] = useState(false);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const overviewChannel =
    source.recording.channels.find((c) => c.id === 'C3')?.id ??
    source.recording.channels[0]!.id;
  const duration = source.recording.durationSeconds,
    span = range.end - range.start;
  useEffect(() => {
    const controller = new AbortController();
    void source
      .readOverview(overviewChannel, 600, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setOverview(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [source, overviewChannel]);
  const points = useMemo(() => {
    const peak = Math.max(
      1,
      ...overview.map((bin) => Math.max(Math.abs(bin.min), Math.abs(bin.max))),
    );
    return (
      overview
        .map(
          (bin) =>
            `${(bin.startSample / source.recording.sampleCount) * 1000},${32 - (bin.max / peak) * 27}`,
        )
        .join(' ') +
      ' ' +
      [...overview]
        .reverse()
        .map(
          (bin) =>
            `${(bin.startSample / source.recording.sampleCount) * 1000},${32 - (bin.min / peak) * 27}`,
        )
        .join(' ')
    );
  }, [overview, source.recording.sampleCount]);

  return (
    <section className="eeg-timeline" aria-label="Recording timeline">
      <div className="eeg-timeline-heading">
        <span>
          Recording overview{' '}
          <small>
            ·{' '}
            {
              source.recording.channels.find((c) => c.id === overviewChannel)
                ?.label
            }
          </small>
        </span>
        <span>
          {formatTime(range.start)} / {formatTime(duration)}
        </span>
      </div>
      <div
        className="eeg-timeline-track"
        onPointerDown={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const t = ((event.clientX - box.left) / box.width) * duration;
          const start =
            t >= range.start && t <= range.end
              ? range.start
              : constrainRange(t - span / 2, span, duration).start;
          onRange(constrainRange(start, span, duration));
          drag.current = { x: event.clientX, start };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const width = event.currentTarget.getBoundingClientRect().width;
          onRange(
            constrainRange(
              drag.current.start +
                ((event.clientX - drag.current.x) / width) * duration,
              span,
              duration,
            ),
          );
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <svg
          viewBox="0 0 1000 64"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points={points} />
        </svg>
        <div
          className="eeg-timeline-window"
          style={{
            left: `${(range.start / duration) * 100}%`,
            width: `${(span / duration) * 100}%`,
          }}
        >
          <i />
          <i />
        </div>
      </div>
      <div className="eeg-timeline-ticks">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <span key={fraction}>
            {formatTime(duration * fraction).slice(0, 5)}
          </span>
        ))}
      </div>
      <label className="eeg-timeline-slider">
        Navigate recording{' '}
        <input
          aria-label="Recording position"
          type="range"
          min={0}
          max={Math.max(0, duration - span)}
          step={1 / source.recording.sampleRateHz}
          value={range.start}
          disabled={span >= duration}
          onChange={(e) =>
            onRange(constrainRange(Number(e.target.value), span, duration))
          }
        />
      </label>
      {error && (
        <p role="status">
          Overview unavailable. Time navigation remains available.
        </p>
      )}
    </section>
  );
}
