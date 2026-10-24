export type EEGChannel = {
  id: string;
  label: string;
  region: string;
  color: string;
  unit: 'µV';
  sampleRateHz?: number;
  sampleCount?: number;
};
export type EEGRecording = {
  id: string;
  identity?: { kind: 'sha256' | 'synthetic-generator'; value: string };
  name: string;
  source: 'synthetic' | 'edf';
  storage?: 'private-cloud';
  /** Navigation grid only for mixed-rate recordings; channel rates govern measurements. */
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
  channels: Record<string, Float32Array | Float64Array>;
  timing?: Record<string, { startSample: number; indices?: number[] }>;
  reduced?: boolean;
};
export type OverviewBin = {
  startSample: number;
  endSample: number;
  min: number;
  max: number;
};
export interface EEGDataSource {
  recording: EEGRecording;
  exportCSV?(
    ids: string[],
    range: TimeRange,
    signal?: AbortSignal,
  ): Promise<Blob>;
  readWindow(
    startSample: number,
    endSample: number,
    channelIds: string[],
    signal?: AbortSignal,
  ): Promise<EEGWindow>;
  readSample?(
    channelId: string,
    sample: number,
    signal?: AbortSignal,
  ): Promise<number>;
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
/** Recording-relative clock; round once so 59.999 s cannot display as 00:60.00. */
export function formatTime(seconds: number, precision: 0 | 2 = 2) {
  const units = 10 ** precision;
  const ticks = Math.round(seconds * units);
  const hours = Math.floor(ticks / (3600 * units));
  const minutes = Math.floor(ticks / (60 * units)) % 60;
  const remainder = ((ticks % (60 * units)) / units)
    .toFixed(precision)
    .padStart(precision ? 5 : 2, '0');
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${remainder}`;
}

/** At most two extrema per horizontal bucket, in original sample order. No averaging away peaks. */
export function peakSamples(
  samples: Float32Array | Float64Array,
  pixels: number,
): number[] {
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
  recording: Pick<EEGRecording, 'sampleRateHz' | 'sampleCount'>,
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

/** Resolve a channel's native clock; the recording grid is never a resampling target. */
export function channelClock(recording: EEGRecording, id?: string) {
  const channel = recording.channels.find((c) => c.id === id);
  return {
    sampleRateHz: channel?.sampleRateHz ?? recording.sampleRateHz,
    sampleCount: channel?.sampleCount ?? recording.sampleCount,
  };
}
export function rateLabel(recording: EEGRecording) {
  const rates = [
    ...new Set(
      recording.channels.map((c) => channelClock(recording, c.id).sampleRateHz),
    ),
  ];
  return rates.length === 1
    ? `${rates[0]} Hz`
    : `${rates.join(' / ')} Hz (native)`;
}
export function sampleAt(data: EEGWindow, id: string, index: number) {
  return (
    data.timing?.[id]?.indices?.[index] ??
    (data.timing?.[id]?.startSample ?? data.startSample) + index
  );
}
export function sampleValue(
  data: EEGWindow | undefined,
  id: string,
  sample: number,
) {
  if (!data) return undefined;
  const timing = data.timing?.[id];
  const index = timing?.indices
    ? timing.indices.indexOf(sample)
    : sample - (timing?.startSample ?? data.startSample);
  return data.channels[id]?.[index];
}
