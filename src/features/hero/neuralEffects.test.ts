/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inspectAnatomy, type Quality } from './anatomy';
import {
  createNeuralEffects,
  validateNeuralAsset,
  particleCounts,
  type NeuralAsset,
} from './neuralEffects';

function readAsset(quality: Quality): NeuralAsset {
  return JSON.parse(
    readFileSync(`public/models/neural-${quality}.json`, 'utf8'),
  );
}
describe('Real cortical fiber assets', () => {
  for (const quality of ['full', 'compact'] as const) {
    it(`${quality}: builds deterministic, finite, bounded GPU layers for both hemispheres`, async () => {
      const asset = validateNeuralAsset(readAsset(quality), quality);
      const regions = new Set(asset.paths.map((p) => p.region));
      expect([...regions].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 12 }, (_, i) => i),
      );
      const buffer = new Uint8Array(
        readFileSync(`public/models/cortex-${quality}.glb`),
      ).buffer;
      const gltf = await new GLTFLoader().parseAsync(buffer, '/models/');
      const anatomy = inspectAnatomy(gltf.scene, quality);
      const first = createNeuralEffects(asset, anatomy.meshes, quality);
      const second = createNeuralEffects(asset, anatomy.meshes, quality);
      expect(first.group.children).toHaveLength(3);
      expect(first.particles).toBe(particleCounts[quality]);
      for (let i = 0; i < 2; i++) {
        const a = (first.group.children[i] as import('three').Mesh).geometry;
        const b = (second.group.children[i] as import('three').Mesh).geometry;
        expect(Array.from(a.attributes.position!.array)).toEqual(
          Array.from(b.attributes.position!.array),
        );
        expect(
          Array.from(a.attributes.position!.array).every(Number.isFinite),
        ).toBe(true);
        a.computeBoundingBox();
        expect(a.boundingBox!.min.x).toBeGreaterThan(-1.4);
        expect(a.boundingBox!.max.x).toBeLessThan(1.4);
      }
      first.update(1.7, 1, 1.5);
      expect(first.uniforms.uHotspots.value.some((p) => p.w > 0)).toBe(true);
      first.update(1.7, 0, 1);
      expect(first.uniforms.uHotspots.value.every((p) => p.w === 0)).toBe(true);
      first.dispose();
      second.dispose();
      anatomy.meshes.forEach((m) => m.geometry.dispose());
    });
  }
  it('rejects corrupt routes and wrong profiles before allocating GPU resources', () => {
    const asset = readAsset('compact');
    expect(() => validateNeuralAsset(asset, 'full')).toThrow();
    asset.paths[0]!.positions[0] = NaN;
    expect(() => validateNeuralAsset(asset, 'compact')).toThrow(/Nonfinite/);
  });
});
