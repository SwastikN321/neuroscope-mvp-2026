import {
  snapSelection,
  type AnnotationSelection,
  type EEGAnnotation,
} from './annotations';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import {
  channelClock,
  sampleAt,
  sampleValue,
  constrainRange,
  nearestVisibleSample,
  peakSamples,
  timeTicks,
  zoomRange,
  type EEGRecording,
  type EEGWindow,
  type TimeRange,
} from './recording';
export type Probe = { sample: number; channelId: string };
const LEFT = 92,
  RIGHT = 22,
  TOP = 16,
  BOTTOM = 32;
export function WaveformViewer({
  recording,
  data,
  range,
  ids,
  amplitude,
  probe,
  onProbe,
  onRange,
  onReset,
  annotationMode = false,
  annotations = [],
  selectedAnnotation,
  annotationDraft,
  onAnnotationSelect,
  onAnnotationCreate,
}: {
  recording: EEGRecording;
  data: EEGWindow;
  range: TimeRange;
  ids: string[];
  amplitude: number;
  probe: Probe | null;
  onProbe: (probe: Probe) => void;
  onRange: (range: TimeRange) => void;
  onReset: () => void;
  annotationMode?: boolean;
  annotations?: EEGAnnotation[];
  selectedAnnotation?: string | null;
  annotationDraft?: AnnotationSelection | null;
  onAnnotationSelect?: (annotation: EEGAnnotation) => void;
  onAnnotationCreate?: (selection: AnnotationSelection) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; range: TimeRange; moved: boolean } | null>(
    null,
  );
  const annotationDrag = useRef<{
    time: number;
    channelId: string;
    x: number;
  } | null>(null);
  const [selection, setSelection] = useState<AnnotationSelection | null>(null);
  function pointerTime(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return (
      range.start +
      Math.max(0, Math.min(1, (event.clientX - rect.left - LEFT) / width)) *
        span
    );
  }
  function dragSelection(
    event: PointerEvent<HTMLDivElement>,
  ): AnnotationSelection {
    const initial = annotationDrag.current!;
    const time = pointerTime(event);
    const interval = Math.abs(event.clientX - initial.x) > 3;
    const selected = snapSelection(recording, {
      type: interval ? 'interval' : 'point',
      channelId: initial.channelId,
      startTime: interval ? Math.min(initial.time, time) : initial.time,
      endTime: interval ? Math.max(initial.time, time) : undefined,
    });
    return selected.endTime === selected.startTime
      ? { ...selected, type: 'point', endTime: undefined }
      : selected;
  }
  const [size, setSize] = useState({ width: 800, height: 550 });
  useEffect(() => {
    const element = host.current!;
    const measure = () =>
      setSize({
        width: element.clientWidth || 800,
        height: element.clientHeight || 550,
      });
    const raf = requestAnimationFrame(measure);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);
  const width = Math.max(1, size.width - LEFT - RIGHT),
    height = size.height - TOP - BOTTOM;
  const row = height / Math.max(1, ids.length),
    span = range.end - range.start;
  const points = useMemo(
    () =>
      ids.map((id) =>
        data.timing?.[id]?.indices
          ? data.timing[id]!.indices!.map((_, i) => i)
          : peakSamples(data.channels[id] ?? new Float32Array(), width),
      ),
    [ids, data, width],
  );
  useEffect(() => {
    const element = canvas.current!,
      ctx = element.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.round(size.width * dpr);
    element.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.font = '10px ui-monospace, monospace';
    ctx.lineWidth = 1;
    for (const t of timeTicks(range, width)) {
      const x = LEFT + ((t - range.start) / span) * width;
      ctx.strokeStyle = '#24323d';
      ctx.beginPath();
      ctx.moveTo(x, TOP);
      ctx.lineTo(x, size.height - BOTTOM);
      ctx.stroke();
      ctx.fillStyle = '#8d9fac';
      ctx.textAlign = 'center';
      ctx.fillText(`${Number(t.toFixed(3))} s`, x, size.height - 10);
    }
    ids.forEach((id, lane) => {
      const channel = recording.channels.find((c) => c.id === id)!;
      const nativeRate = channelClock(recording, id).sampleRateHz;
      const y = TOP + row * (lane + 0.5);
      ctx.strokeStyle = '#1b2934';
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(LEFT, y);
      ctx.lineTo(LEFT + width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = channel.color;
      ctx.textAlign = 'left';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(channel.label, 14, y + 4, LEFT - 22);
      ctx.save();
      ctx.beginPath();
      ctx.rect(LEFT, TOP + row * lane, width, row);
      ctx.clip();
      ctx.strokeStyle = channel.color;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      points[lane]!.forEach((index, i) => {
        const time = sampleAt(data, id, index) / nativeRate;
        const px = LEFT + ((time - range.start) / span) * width;
        const py = y - (data.channels[id]![index]! / amplitude) * row * 0.42;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    });
    // Per-lane calibration: each half-lane spans the selected µV range.
    ctx.strokeStyle = '#8d9fac';
    const bar = row * 0.42;
    ctx.beginPath();
    ctx.moveTo(size.width - 11, TOP + row * 0.5);
    ctx.lineTo(size.width - 11, TOP + row * 0.5 - bar);
    ctx.stroke();
  }, [data, range, ids, amplitude, points, recording, size, width, row, span]);
  function inspect(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(width, event.clientX - rect.left - LEFT));
    const lane = Math.max(
      0,
      Math.min(
        ids.length - 1,
        Math.floor((event.clientY - rect.top - TOP) / row),
      ),
    );
    const sample = nearestVisibleSample(
      range.start + (x / width) * span,
      range,
      channelClock(recording, ids[lane]),
    );
    if (ids[lane]) onProbe({ sample, channelId: ids[lane] });
  }
  function key(event: KeyboardEvent) {
    const clock = channelClock(recording, probe?.channelId || ids[0]);
    if (
      [
        'ArrowLeft',
        'ArrowRight',
        '+',
        '=',
        '-',
        'Home',
        'ArrowUp',
        'ArrowDown',
      ].includes(event.key)
    )
      event.preventDefault();
    if (event.key === 'Home') onReset();
    if (event.key === '+' || event.key === '=')
      onRange(zoomRange(range, 0.5, recording.durationSeconds));
    if (event.key === '-')
      onRange(zoomRange(range, 2, recording.durationSeconds));
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      if (event.shiftKey && ids.length)
        onProbe({
          channelId: probe?.channelId || ids[0]!,
          sample: Math.max(
            0,
            Math.min(
              clock.sampleCount - 1,
              (probe?.sample ?? Math.round(range.start * clock.sampleRateHz)) +
                direction,
            ),
          ),
        });
      else
        onRange(
          constrainRange(
            range.start + direction * span * 0.25,
            span,
            recording.durationSeconds,
          ),
        );
    }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && ids.length) {
      const index = Math.max(0, ids.indexOf(probe?.channelId || ids[0]!));
      const id =
        ids[
          Math.max(
            0,
            Math.min(
              ids.length - 1,
              index + (event.key === 'ArrowUp' ? -1 : 1),
            ),
          )
        ]!;
      const target = channelClock(recording, id);
      onProbe({
        channelId: id,
        sample: Math.min(
          target.sampleCount - 1,
          Math.round(
            (probe ? probe.sample / clock.sampleRateHz : range.start) *
              target.sampleRateHz,
          ),
        ),
      });
    }
  }
  const probeTime = probe
    ? probe.sample / channelClock(recording, probe.channelId).sampleRateHz
    : -1;
  const lane = probe ? ids.indexOf(probe.channelId) : -1;
  const value = probe
    ? sampleValue(data, probe.channelId, probe.sample)
    : undefined;
  const showProbe =
    lane >= 0 &&
    value !== undefined &&
    probeTime >= range.start &&
    probeTime <= range.end;
  return (
    <div
      ref={host}
      className={`eeg-plot${annotationMode ? ' is-annotating' : ''}`}
      data-mode={annotationMode ? 'annotate' : 'navigate'}
      style={ids.length > 16 ? { height: ids.length * 30 + 48 } : undefined}
      tabIndex={0}
      role="group"
      aria-label="Interactive EEG waveform viewer"
      aria-describedby="eeg-plot-help"
      data-start={range.start.toFixed(6)}
      data-end={range.end.toFixed(6)}
      data-channels={ids.join(',')}
      data-rendered-points={points.reduce((n, p) => n + p.length, 0)}
      onKeyDown={key}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.focus({ preventScroll: true });
        if (annotationMode) {
          const rect = event.currentTarget.getBoundingClientRect();
          const lane = Math.floor((event.clientY - rect.top - TOP) / row);
          if (
            !ids[lane] ||
            event.clientX < rect.left + LEFT ||
            event.clientX > rect.left + LEFT + width
          )
            return;
          annotationDrag.current = {
            time: pointerTime(event),
            channelId: ids[lane],
            x: event.clientX,
          };
          setSelection(dragSelection(event));
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        drag.current = { x: event.clientX, range, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        inspect(event);
      }}
      onPointerMove={(event) => {
        if (annotationMode) {
          if (annotationDrag.current) setSelection(dragSelection(event));
          return;
        }
        if (drag.current) {
          const dx = event.clientX - drag.current.x;
          if (Math.abs(dx) > 3) drag.current.moved = true;
          if (drag.current.moved)
            onRange(
              constrainRange(
                drag.current.range.start -
                  (dx / width) *
                    (drag.current.range.end - drag.current.range.start),
                span,
                recording.durationSeconds,
              ),
            );
        } else if (event.pointerType !== 'touch') inspect(event);
      }}
      onPointerUp={(event) => {
        if (annotationDrag.current) {
          onAnnotationCreate?.(dragSelection(event));
          annotationDrag.current = null;
          setSelection(null);
        }
        if (drag.current && !drag.current.moved) inspect(event);
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        annotationDrag.current = null;
        setSelection(null);
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        annotationDrag.current = null;
        setSelection(null);
        drag.current = null;
      }}
      onWheel={(event) => {
        if (event.ctrlKey || event.metaKey) return;
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY))
          onRange(
            constrainRange(
              range.start + (event.deltaX / width) * span,
              span,
              recording.durationSeconds,
            ),
          );
      }}
    >
      <canvas
        ref={canvas}
        aria-label={`${ids.length} EEG channels, ${range.start.toFixed(2)} to ${range.end.toFixed(2)} seconds, microvolts`}
        role="img"
      />
      {[
        ...annotations,
        ...(selection || annotationDraft
          ? [
              {
                ...(selection || annotationDraft!),
                id: 'draft',
                label: 'Unsaved selection',
              },
            ]
          : []),
      ].map((item) => {
        const laneIndex = item.channelId ? ids.indexOf(item.channelId) : 0;
        if (
          laneIndex < 0 ||
          !ids.length ||
          !Number.isFinite(item.startTime) ||
          (item.type === 'interval' && !Number.isFinite(item.endTime)) ||
          item.startTime > range.end ||
          (item.endTime ?? item.startTime) < range.start
        )
          return null;
        const start = Math.max(range.start, item.startTime);
        const end = Math.min(range.end, item.endTime ?? item.startTime);
        if (end < start) return null;
        const draft = item.id === 'draft';
        return (
          <div
            key={item.id}
            data-annotation-overlay={item.id}
            data-time={item.startTime}
            className={`eeg-annotation-overlay ${item.type}${draft ? ' is-draft' : ''}${selectedAnnotation === item.id ? ' is-selected' : ''}`}
            style={{
              left: LEFT + ((start - range.start) / span) * width,
              top: TOP + (item.channelId ? laneIndex * row : 0),
              width:
                item.type === 'interval'
                  ? Math.max(1, ((end - start) / span) * width)
                  : 1,
              height: item.channelId ? row : height,
            }}
          >
            {draft ? (
              <span className="eeg-annotation-pin">
                {item.type === 'point' ? '◆' : '▰'}
              </span>
            ) : (
              <button
                className="eeg-annotation-pin"
                aria-label={`Inspect annotation: ${item.label}`}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onAnnotationSelect?.(item as EEGAnnotation);
                }}
              >
                {item.type === 'point' ? '◆' : '▰'}
              </button>
            )}
          </div>
        );
      })}
      {showProbe && (
        <div
          className="eeg-crosshair"
          style={{
            left: LEFT + ((probeTime - range.start) / span) * width,
            top: TOP,
            height,
          }}
        >
          <i
            style={{
              visibility: Math.abs(value!) > amplitude ? 'hidden' : 'visible',
              top:
                row * (lane + 0.5) -
                Math.max(-1, Math.min(1, value! / amplitude)) * row * 0.42,
            }}
          />
        </div>
      )}
      {!ids.length && (
        <div className="eeg-empty">
          <strong>No channels selected</strong>
          <span>
            Select channels in the channel panel to view their signals.
          </span>
        </div>
      )}
    </div>
  );
}
