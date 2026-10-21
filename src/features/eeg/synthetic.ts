import type { EEGChannel, EEGDataSource, OverviewBin } from './recording';

const labels = [
  'Fp1',
  'Fp2',
  'F3',
  'F4',
  'C3',
  'C4',
  'P3',
  'P4',
  'O1',
  'O2',
  'T7',
  'T8',
];
const regions = [
  'Frontopolar',
  'Frontal',
  'Central',
  'Parietal',
  'Occipital',
  'Temporal',
];
const colors = [
  '#79d9da',
  '#8ebce8',
  '#b2b6f2',
  '#b6a3df',
  '#8dc9c1',
  '#d0bca0',
];
function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** Illustrative spectral mixture in µV. Not a physiological forward model or diagnostic simulation. */
export function createSyntheticSource(): EEGDataSource {
  const sampleRateHz = 256,
    durationSeconds = 120,
    sampleCount = sampleRateHz * durationSeconds;
  const channels: EEGChannel[] = labels.map((label, i) => ({
    id: label,
    label,
    region: regions[Math.floor(i / 2)]!,
    color: colors[Math.floor(i / 2)]!,
    unit: 'µV',
  }));
  const data: Record<string, Float32Array> = {};
  channels.forEach((channel, c) => {
    const random = randomSource(31001 + c * 7919);
    const components = Array.from({ length: 18 }, (_, k) => ({
      frequency: 0.7 + k * 1.73 + random() * 0.4,
      phase: random() * Math.PI * 2,
      amplitude: 6 / Math.sqrt(1 + k),
    }));
    const values = new Float32Array(sampleCount);
    let colored = 0;
    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleRateHz;
      colored = colored * 0.94 + (random() - 0.5) * 3;
      const envelope =
        0.72 + 0.22 * Math.sin(t * 0.49 + c * 0.67) + 0.1 * Math.sin(t * 0.13);
      let value = colored + 2 * Math.sin(2 * Math.PI * 0.23 * t + c);
      for (const component of components)
        value +=
          envelope *
          component.amplitude *
          Math.sin(2 * Math.PI * component.frequency * t + component.phase);
      value +=
        (c >= 6 && c <= 9 ? 13 : 7) *
        (0.65 + 0.3 * Math.sin(t * 0.21 + c)) *
        Math.sin(2 * Math.PI * (9.1 + c * 0.12) * t + c * 0.41);
      // Broad transient variation; no clinical event labels.
      value += (c < 2 ? 38 : 5) * Math.exp(-(((t - 23.4) / 0.36) ** 2));
      values[i] = value;
    }
    data[channel.id] = values;
  });
  const recording = {
    id: 'NS-DEMO-001',
    identity: {
      kind: 'synthetic-generator' as const,
      value: 'neuroscope-synthetic-v1',
    },
    name: 'Resting-state study',
    source: 'synthetic' as const,
    sampleRateHz,
    sampleCount,
    durationSeconds,
    channels,
    reference: 'Synthetic channel potentials',
    description:
      'Seeded spectral mixtures and colored noise. No patient data; no clinical interpretation.',
  };
  function check(signal?: AbortSignal) {
    signal?.throwIfAborted();
  }
  return {
    recording,
    async readWindow(startSample, endSample, channelIds, signal) {
      check(signal);
      if (
        !Number.isInteger(startSample) ||
        !Number.isInteger(endSample) ||
        startSample < 0 ||
        endSample > sampleCount ||
        startSample > endSample
      )
        throw new Error('Invalid sample window');
      const channels: Record<string, Float32Array> = {};
      for (const id of channelIds) {
        if (!data[id]) throw new Error(`Unknown channel: ${id}`);
        channels[id] = data[id].subarray(startSample, endSample);
      }
      return { startSample, endSample, channels };
    },
    async readOverview(channelId, bins, signal) {
      check(signal);
      const values = data[channelId];
      if (!values || !Number.isInteger(bins) || bins < 1)
        throw new Error('Invalid overview request');
      const result: OverviewBin[] = [];
      const step = Math.ceil(sampleCount / Math.min(sampleCount, bins));
      for (let i = 0; i < sampleCount; i += step) {
        const end = Math.min(sampleCount, i + step);
        let min = Infinity,
          max = -Infinity;
        for (let j = i; j < end; j++) {
          min = Math.min(min, values[j]!);
          max = Math.max(max, values[j]!);
        }
        result.push({ startSample: i, endSample: end, min, max });
      }
      return result;
    },
  };
}
