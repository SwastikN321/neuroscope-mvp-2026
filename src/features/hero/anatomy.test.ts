/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  anatomyProfiles,
  fitAnatomy,
  inspectAnatomy,
  type Quality,
} from './anatomy';

async function load(quality: Quality) {
  const file = await readFile(`public${anatomyProfiles[quality].url}`);
  const bytes = new Uint8Array(file).buffer;
  return new GLTFLoader().parseAsync(bytes, '');
}

describe('Shipped anatomical assets', () => {
  it.each(['full', 'compact'] as const)(
    'loads both %s hemispheres with real GLTFLoader',
    async (quality) => {
      const gltf = await load(quality);
      const anatomy = inspectAnatomy(gltf.scene, quality);
      expect(anatomy.meshes.map((mesh) => mesh.name).sort()).toEqual([
        'cortex_left',
        'cortex_right',
      ]);
      expect(anatomy.triangles).toBe(anatomyProfiles[quality].triangles);
      expect(anatomy.bounds.min.x).toBeLessThan(0);
      expect(anatomy.bounds.max.x).toBeGreaterThan(0);
    },
  );
  it('rejects a missing hemisphere instead of showing a partial model', async () => {
    const { scene } = await load('compact');
    const right = scene.getObjectByName('cortex_right')!;
    right.removeFromParent();
    expect(() => inspectAnatomy(scene, 'compact')).toThrow(
      /both named hemispheres/,
    );
  });
  it.each([0.5, 1, 1.6, 2.4])(
    'keeps arbitrary rotations inside the frustum at aspect %s',
    (aspect) => {
      const camera = new PerspectiveCamera(34);
      const radius = 1.8;
      const distance = fitAnatomy(camera, radius, aspect);
      const halfVertical = (camera.fov * Math.PI) / 360;
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
      expect(Math.asin(radius / distance)).toBeLessThan(
        Math.min(halfVertical, halfHorizontal),
      );
      expect(camera.near).toBeLessThan(distance - radius);
      expect(camera.far).toBeGreaterThan(distance + radius);
    },
  );
});
