export type EEGChannel = {
  id: string;
  label: string;
  region: string;
  color: string;
  unit: 'µV';
};
export type EEGRecording = {
  id: string;
  name: string;
  source: 'synthetic' | 'edf';
  sampleRateHz: number;
  sampleCount: number;
  durationSeconds: number;
  channels: EEGChannel[];
  reference: string;
  description: string;
};
/** Half-open sample intervals; amplitudes are always microvolts at this boundary. */
export type EEGWindow = {
  startSample: number;
  endSample: number;
  channels: Record<string, Float32Array>;
};
export type OverviewBin = {
  startSample: number;
  endSample: number;
  min: number;
  max: number;
};
export interface EEGDataSource {
  recording: EEGRecording;
  readWindow(
    startSample: number,
    endSample: number,
    channelIds: string[],
    signal?: AbortSignal,
  ): Promise<EEGWindow>;
  readOverview(
    channelId: string,
    bins: number,
    signal?: AbortSignal,
  ): Promise<OverviewBin[]>;
}
export type TimeRange = { start: number; end: number };
export function constrainRange(
  start: number,
  span: number,
  duration: number,
): TimeRange {
  const width = Math.min(duration, Math.max(0.25, span));
  const left = Math.max(0, Math.min(duration - width, start));
  return { start: left, end: left + width };
}
export function zoomRange(
  range: TimeRange,
  factor: number,
  duration: number,
  anchor = 0.5,
) {
  const span = Math.min(
    duration,
    Math.max(0.25, (range.end - range.start) * factor),
  );
  return constrainRange(
    range.start + (range.end - range.start - span) * anchor,
    span,
    duration,
  );
}
export function sampleInterval(range: TimeRange, recording: EEGRecording) {
  return [
    Math.max(0, Math.floor(range.start * recording.sampleRateHz)),
    Math.min(
      recording.sampleCount,
      Math.ceil(range.end * recording.sampleRateHz) + 1,
    ),
  ] as const;
}
export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}
/** At most two extrema per horizontal bucket, in original sample order. No averaging away peaks. */
export function peakSamples(samples: Float32Array, pixels: number): number[] {
  const step = Math.max(1, Math.ceil(samples.length / Math.max(1, pixels)));
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i += step) {
    let min = i,
      max = i;
    for (let j = i + 1; j < Math.min(samples.length, i + step); j++) {
      if (samples[j]! < samples[min]!) min = j;
      if (samples[j]! > samples[max]!) max = j;
    }
    indices.push(Math.min(min, max));
    if (min !== max) indices.push(Math.max(min, max));
  }
  return indices;
}
export function timeTicks(range: TimeRange, width: number) {
  const ideal =
    (range.end - range.start) / Math.max(2, Math.floor(width / 100));
  const magnitude = 10 ** Math.floor(Math.log10(ideal));
  const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= ideal)!;
  const ticks: number[] = [];
  for (
    let t = Math.ceil(range.start / step) * step;
    t <= range.end + 1e-8;
    t += step
  )
    ticks.push(Number(t.toFixed(6)));
  return ticks;
}

/** Round inspection to an actual sample without moving past a fractional viewport boundary. */
export function nearestVisibleSample(
  time: number,
  range: TimeRange,
  recording: EEGRecording,
) {
  return Math.min(
    recording.sampleCount - 1,
    Math.floor(range.end * recording.sampleRateHz),
    Math.max(
      Math.ceil(range.start * recording.sampleRateHz),
      Math.round(time * recording.sampleRateHz),
    ),
  );
}
