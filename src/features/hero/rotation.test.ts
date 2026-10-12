import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  dragRotation,
  keyboardRotation,
  trackPoint,
  type Rotation,
} from './rotation';

describe('Trackball rotation', () => {
  it('does not accelerate abruptly at the virtual trackball rim', () => {
    for (const edge of [Math.sqrt(0.5), 1]) {
      const rotation = dragRotation(
        trackPoint(edge - 0.001, 0),
        trackPoint(edge + 0.001, 0),
        [0, 0, 0, 1],
      );
      expect(2 * Math.acos(Math.min(1, Math.abs(rotation[3])))).toBeLessThan(
        0.005,
      );
    }
  });
  it('follows pointer direction, including the opposite-side edge case', () => {
    for (const [previous, next] of [
      [trackPoint(0, 0), trackPoint(0.2, -0.1)],
      [trackPoint(-1, 0), trackPoint(1, 0)],
    ]) {
      const quaternion = dragRotation(previous!, next!, [0, 0, 0, 1]);
      const rotated = new Vector3(...previous!).applyQuaternion(
        new Quaternion(...quaternion),
      );
      expect(rotated.distanceTo(new Vector3(...next!))).toBeLessThan(1e-6);
      expect(Math.hypot(...quaternion)).toBeCloseTo(1, 10);
    }
  });
  it('remains normalized through repeated turns on mixed axes', () => {
    let rotation: Rotation = [0, 0, 0, 1];
    for (let i = 0; i < 2400; i++)
      rotation = keyboardRotation(rotation, 0.01, 0.02);
    expect(rotation.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...rotation)).toBeCloseTo(1, 10);
    const fullTurn = keyboardRotation([0, 0, 0, 1], 0, Math.PI * 2);
    expect(
      new Vector3(0, 0, 1)
        .applyQuaternion(new Quaternion(...fullTurn))
        .distanceTo(new Vector3(0, 0, 1)),
    ).toBeLessThan(1e-6);
  });
});
