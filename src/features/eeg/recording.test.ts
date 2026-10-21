import { beforeAll, describe, expect, it } from 'vitest';
import {
  constrainRange,
  formatTime,
  nearestVisibleSample,
  peakSamples,
  sampleInterval,
  timeTicks,
  zoomRange,
  type EEGDataSource,
} from './recording';
import { createSyntheticSource } from './synthetic';
let source: EEGDataSource;
beforeAll(() => {
  source = createSyntheticSource();
});
describe('Synthetic recording contract', () => {
  it('provides consistent, finite, reproducible and distinct microvolt channels', async () => {
    const meta = source.recording;
    expect(meta.channels).toHaveLength(12);
    expect(meta.sampleRateHz).toBe(256);
    expect(meta.sampleCount).toBe(meta.sampleRateHz * meta.durationSeconds);
    expect(new Set(meta.channels.map((c) => c.id)).size).toBe(12);
    const ids = meta.channels.map((c) => c.id);
    const a = await source.readWindow(0, meta.sampleCount, ids);
    const b = await createSyntheticSource().readWindow(0, 256, ids);
    for (const channel of meta.channels) {
      expect(channel.unit).toBe('µV');
      expect(a.channels[channel.id]!.length).toBe(30720);
      expect(a.channels[channel.id]!.every(Number.isFinite)).toBe(true);
      expect(a.channels[channel.id]!.slice(0, 256)).toEqual(
        b.channels[channel.id],
      );
    }
    expect(a.channels.Fp1).not.toEqual(a.channels.Fp2);
    const segment = a.channels.C3!.slice(0, 256);
    expect(segment).not.toEqual(a.channels.C3!.slice(256, 512));
    expect(Math.max(...segment) - Math.min(...segment)).toBeGreaterThan(20);
  });
  it('returns exact half-open windows and rejects corrupt or aborted requests', async () => {
    const full = await source.readWindow(0, 30720, ['C3']);
    const tail = await source.readWindow(30719, 30720, ['C3']);
    expect(tail.channels.C3).toEqual(full.channels.C3!.slice(-1));
    expect(tail.startSample / 256).toBe(119.99609375);
    expect((await source.readWindow(10, 10, ['C3'])).channels.C3).toHaveLength(
      0,
    );
    await expect(source.readWindow(-1, 20, ['C3'])).rejects.toThrow();
    await expect(source.readWindow(1.5, 20, ['C3'])).rejects.toThrow();
    await expect(source.readWindow(1, 30721, ['C3'])).rejects.toThrow();
    await expect(source.readWindow(1, 20, ['missing'])).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      source.readWindow(0, 20, ['C3'], controller.signal),
    ).rejects.toThrow();
  });
  it('preserves the entire overview envelope including its last sample', async () => {
    const bins = await source.readOverview('C3', 600);
    const full = (await source.readWindow(0, 30720, ['C3'])).channels.C3!;
    expect(bins[0]!.startSample).toBe(0);
    expect(bins.at(-1)!.endSample).toBe(full.length);
    expect(Math.max(...bins.map((b) => b.max))).toBe(Math.max(...full));
    expect(Math.min(...bins.map((b) => b.min))).toBe(Math.min(...full));
  });
});
describe('Time navigation and scientific display', () => {
  it('clamps pan/zoom at recording boundaries and preserves the zoom anchor', () => {
    expect(constrainRange(-20, 10, 120)).toEqual({ start: 0, end: 10 });
    expect(constrainRange(119, 10, 120)).toEqual({ start: 110, end: 120 });
    expect(constrainRange(30, 240, 120)).toEqual({ start: 0, end: 120 });
    expect(zoomRange({ start: 20, end: 40 }, 0.5, 120)).toEqual({
      start: 25,
      end: 35,
    });
    expect(zoomRange({ start: 20, end: 40 }, 0.5, 120, 0)).toEqual({
      start: 20,
      end: 30,
    });
    expect(zoomRange({ start: 20, end: 20.25 }, 0.5, 120).end - 20).toBe(0.25);
    expect(sampleInterval({ start: 119, end: 120 }, source.recording)).toEqual([
      30464, 30720,
    ]);
    expect(
      timeTicks({ start: 1.04, end: 1.29 }, 300).every(
        (t) => t >= 1.04 && t <= 1.29,
      ),
    ).toBe(true);
  });
  it('keeps pointer inspection inside fractional viewport edges', () => {
    const range = { start: 1.001, end: 2.003 };
    expect(
      nearestVisibleSample(range.start, range, source.recording) / 256,
    ).toBeGreaterThanOrEqual(range.start);
    expect(
      nearestVisibleSample(range.end, range, source.recording) / 256,
    ).toBeLessThanOrEqual(range.end);
    expect(
      nearestVisibleSample(120, { start: 110, end: 120 }, source.recording),
    ).toBe(30719);
  });
  it('retains narrow peaks in sample order with bounded display size', () => {
    const samples = new Float32Array(10000);
    samples[511] = 80;
    samples[512] = -95;
    const selected = peakSamples(samples, 100);
    expect(selected).toContain(511);
    expect(selected).toContain(512);
    expect(selected).toEqual([...selected].sort((a, b) => a - b));
    expect(selected.length).toBeLessThanOrEqual(200);
    expect(peakSamples(new Float32Array([1, 2, 3]), 100)).toEqual([0, 1, 2]);
  });
});

it('formats long recordings and carries rounded seconds across minute/hour boundaries', () => {
  expect(formatTime(79500)).toBe('22:05:00.00');
  expect(formatTime(79500, 0)).toBe('22:05:00');
  expect(formatTime(59.999)).toBe('01:00.00');
  expect(formatTime(3599.999)).toBe('01:00:00.00');
  expect(formatTime(61.125)).toBe('01:01.13');
  expect(formatTime(0, 0)).toBe('00:00');
});
