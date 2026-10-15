import { describe, it, expect } from 'vitest';
import {
  journeyState,
  networkPoint,
  signalPoint,
  syntheticEEG,
  signalMotion,
} from './journey';
import { createSignalGeometry } from './signalGeometry';

describe('Reversible scroll choreography', () => {
  it('clamps endpoints and reproduces every state when reversing', () => {
    expect(journeyState(-1)).toEqual(journeyState(0));
    expect(journeyState(2)).toEqual(journeyState(1));
    const forward = Array.from({ length: 101 }, (_, i) =>
      journeyState(i / 100),
    );
    const backward = Array.from({ length: 101 }, (_, i) =>
      journeyState((100 - i) / 100),
    ).reverse();
    expect(backward).toEqual(forward);
    for (let i = 1; i < forward.length; i++) {
      expect(forward[i]!.approach).toBeGreaterThanOrEqual(
        forward[i - 1]!.approach,
      );
      expect(forward[i]!.signal).toBeGreaterThanOrEqual(forward[i - 1]!.signal);
      expect(forward[i]!.cortex).toBeLessThanOrEqual(forward[i - 1]!.cortex);
    }
    expect(journeyState(0)).toMatchObject({
      cortex: 1,
      network: 0,
      signal: 0,
      heroText: 1,
      signalText: 0,
    });
    expect(journeyState(1)).toMatchObject({
      cortex: 0,
      network: 1,
      signal: 1,
      heroText: 0,
      signalText: 1,
    });
  });
  it('keeps the cortex out of the close network view', () => {
    expect(journeyState(0.48).cortex).toBe(0);
    expect(journeyState(0.48).network).toBeGreaterThan(0.8);
  });
});
describe('Synthetic signal and morph destinations', () => {
  it('keeps timeline motion continuous, bounded and reproducible', () => {
    for (let time = 0; time < 60; time += 0.1) {
      expect(signalMotion(time)).toBeGreaterThanOrEqual(0);
      expect(signalMotion(time)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(signalMotion(time + 1 / 60) - signalMotion(time)),
      ).toBeLessThan(0.004);
      expect(signalMotion(time)).toBe(signalMotion(time));
    }
    expect(signalMotion(0)).not.toBe(signalMotion(4));
  });
  it('produces reproducible, distinct, bounded, aperiodic channels', () => {
    const samples = Array.from({ length: 640 }, (_, i) =>
      syntheticEEG(0, i / 80),
    );
    expect(samples.every((x) => Number.isFinite(x) && Math.abs(x) <= 1)).toBe(
      true,
    );
    expect(samples).toEqual(
      Array.from({ length: 640 }, (_, i) => syntheticEEG(0, i / 80)),
    );
    expect(samples).not.toEqual(
      Array.from({ length: 640 }, (_, i) => syntheticEEG(1, i / 80)),
    );
    const difference =
      samples
        .slice(80)
        .reduce((sum, x, i) => sum + Math.abs(x - samples[i]!), 0) / 560;
    expect(difference).toBeGreaterThan(0.1);
  });
  for (const aspect of [1920 / 1080, 1440 / 900, 390 / 844]) {
    it(`builds continuous finite strips at aspect ${aspect}`, () => {
      const geometry = createSignalGeometry('compact', aspect);
      expect(geometry.attributes.position!.count).toBe(6 * 640 * 2);
      expect(
        Array.from(geometry.attributes.position!.array).every(Number.isFinite),
      ).toBe(true);
      const drift = geometry.attributes.aSignalDrift!;
      expect(drift.count).toBe(geometry.attributes.position!.count);
      expect(Array.from(drift.array).every(Number.isFinite)).toBe(true);
      const p = geometry.attributes.position!;
      for (let i = 0; i < p.count; i += 2) {
        expect(
          Math.hypot(p.getX(i) - p.getX(i + 1), p.getY(i) - p.getY(i + 1)),
        ).toBeCloseTo(0.026, 5);
      }
      for (let i = 0; i < 6; i++) {
        expect(signalPoint(i, 0.5, aspect).every(Number.isFinite)).toBe(true);
        expect(networkPoint(0.5, i, 40).every(Number.isFinite)).toBe(true);
      }
      geometry.dispose();
    });
  }
});
