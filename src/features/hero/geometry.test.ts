import { describe, expect, it } from 'vitest';
import { createSculpture } from './geometry';

describe('Procedural sculpture data', () => {
  it('generates finite, indexed geometry with a smaller mobile budget', () => {
    const full = createSculpture('full');
    const compact = createSculpture('compact');
    try {
      for (const model of [full, compact]) {
        for (const geometry of [
          model.left,
          model.right,
          model.fibers,
          model.nodes,
        ]) {
          const position = geometry.getAttribute('position');
          expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
          const index = geometry.getIndex();
          if (index)
            expect(
              Array.from(index.array).every((i) => i < position.count),
            ).toBe(true);
        }
        const normals = model.right.getAttribute('normal');
        expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
        expect(model.right.boundingSphere!.radius).toBeGreaterThan(1.5);
        expect(model.right.boundingSphere!.radius).toBeLessThan(2.5);
      }
      expect(compact.right.getIndex()!.count).toBeLessThan(
        full.right.getIndex()!.count / 2,
      );
      expect(compact.nodes.getAttribute('position').count).toBeLessThan(
        full.nodes.getAttribute('position').count / 2,
      );
    } finally {
      full.dispose();
      compact.dispose();
    }
  });

  it('keeps hemispheres mirrored with a physical central fissure', () => {
    const model = createSculpture('compact');
    try {
      const left = model.left.getAttribute('position');
      const right = model.right.getAttribute('position');
      for (let i = 0; i < left.count; i += 17) {
        expect(left.getX(i)).toBeCloseTo(-right.getX(i));
        expect(left.getY(i)).toBeCloseTo(right.getY(i));
        expect(left.getZ(i)).toBeCloseTo(right.getZ(i));
        expect(right.getX(i)).toBeGreaterThan(0);
      }
    } finally {
      model.dispose();
    }
  });

  it('provides valid GPU trajectory data across every pulse path', () => {
    const model = createSculpture('compact');
    try {
      const data = model.paths.image.data;
      if (!data) throw new Error('Missing trajectory data');
      expect(model.paths.image.width).toBe(model.profile.samples);
      expect(model.paths.image.height).toBe(model.profile.paths);
      expect(Array.from(data).every(Number.isFinite)).toBe(true);
      const ids = model.pulses.getAttribute('aPath');
      expect(
        Array.from(ids.array).every((i) => i >= 0 && i < model.profile.paths),
      ).toBe(true);
      // Every stored point must remain in the sculpture's physical envelope.
      for (let i = 0; i < data.length; i += 4) {
        expect(Math.abs(data[i]!)).toBeLessThan(1.5);
        expect(Math.abs(data[i + 1]!)).toBeLessThan(1.3);
        expect(Math.abs(data[i + 2]!)).toBeLessThan(1.9);
      }
    } finally {
      model.dispose();
    }
  });
});
