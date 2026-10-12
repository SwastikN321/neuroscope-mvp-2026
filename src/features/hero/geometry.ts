import {
  BufferGeometry,
  Float32BufferAttribute,
  DataTexture,
  FloatType,
  RGBAFormat,
  Vector3,
} from 'three';

export type Quality = 'full' | 'compact';
export const profiles = {
  full: {
    columns: 256,
    rows: 160,
    paths: 96,
    samples: 192,
    nodes: 14000,
    dpr: 1.25,
  },
  compact: {
    columns: 160,
    rows: 96,
    paths: 48,
    samples: 128,
    nodes: 4800,
    dpr: 1,
  },
} as const;

// Original, deterministic geometry. This is a brain-inspired artwork, not an anatomical model.
// Flattening the medial half of each lobe creates a true longitudinal fissure.
export function cortexPoint(
  theta: number,
  phi: number,
  side: number,
  lift = 0,
): Vector3 {
  const nx = Math.sin(theta) * Math.cos(phi);
  const ny = Math.cos(theta);
  const nz = Math.sin(theta) * Math.sin(phi);
  const field =
    16 * nx +
    12 * ny +
    9 * nz +
    2.8 * Math.sin(7 * nz - 4 * ny) +
    2.3 * Math.sin(9 * ny + 5 * nx) +
    1.1 * Math.cos(11 * nx - 7 * nz);
  const ridge = Math.abs(Math.sin(field));
  const fold =
    (0.045 * Math.sqrt(ridge) - 0.072 * Math.exp(-22 * ridge * ridge)) *
    Math.max(0.1, nx);
  const radial = 1 + fold + lift;
  const width = 1.28 * (1 + 0.065 * nz - 0.06 * ny);
  const x = side * (0.034 + (nx > 0 ? nx * width * radial : nx * 0.024));
  const y = ny * (ny < 0 ? 0.89 : 1.14) * radial + 0.065 * nz;
  const z = nz * 1.66 * radial * (1 - 0.035 * ny) + 0.065 * ny;
  return new Vector3(x, y, z);
}

function hemisphere(columns: number, rows: number, side: number) {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const theta = (row / rows) * Math.PI;
    for (let column = 0; column <= columns; column++) {
      const phi = (column / columns) * Math.PI * 2;
      const point = cortexPoint(theta, phi, side);
      vertices.push(point.x, point.y, point.z);
      const detail = 0.68 + 0.14 * Math.sin(theta * 9 + Math.cos(phi * 6));
      colors.push(detail * 0.78, detail * 0.91, detail);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        const b = a + columns + 1;
        if (side > 0) indices.push(a, a + 1, b, b, a + 1, b + 1);
        else indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// The same curved tracts drive the filament geometry and the GPU particle lookup.
export function pathwayPoint(path: number, count: number, t: number): Vector3 {
  const side = path % 2 === 0 ? 1 : -1;
  const layer = Math.floor(path / 2);
  const latitude = 0.15 + ((layer + 0.5) / (count / 2)) * 2.8;
  const phi = -Math.PI / 2 + t * Math.PI;
  const theta =
    latitude +
    0.1 * Math.sin(phi * 5 + latitude * 7) +
    0.045 * Math.sin(phi * 11 - latitude * 3);
  return cortexPoint(theta, phi, side, 0.016);
}

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function createSculpture(quality: Quality) {
  const profile = profiles[quality];
  const left = hemisphere(profile.columns, profile.rows, -1);
  const right = hemisphere(profile.columns, profile.rows, 1);
  const positions: number[] = [];
  const progress: number[] = [];
  const pathIds: number[] = [];
  const lookup = new Float32Array(profile.samples * profile.paths * 4);
  for (let path = 0; path < profile.paths; path++) {
    for (let sample = 0; sample < profile.samples; sample++) {
      const t = sample / (profile.samples - 1);
      const point = pathwayPoint(path, profile.paths, t);
      const offset = (path * profile.samples + sample) * 4;
      lookup.set([point.x, point.y, point.z, 1], offset);
      if (sample < profile.samples - 1) {
        const next = pathwayPoint(
          path,
          profile.paths,
          (sample + 1) / (profile.samples - 1),
        );
        positions.push(point.x, point.y, point.z, next.x, next.y, next.z);
        progress.push(t, (sample + 1) / (profile.samples - 1));
        pathIds.push(path, path);
      }
    }
  }
  const fibers = new BufferGeometry();
  fibers.setAttribute('position', new Float32BufferAttribute(positions, 3));
  fibers.setAttribute('aProgress', new Float32BufferAttribute(progress, 1));
  fibers.setAttribute('aPath', new Float32BufferAttribute(pathIds, 1));
  fibers.computeBoundingSphere();
  const paths = new DataTexture(
    lookup,
    profile.samples,
    profile.paths,
    RGBAFormat,
    FloatType,
  );
  paths.needsUpdate = true;

  const random = seeded(8675309);
  const nodes = new BufferGeometry();
  const nodePositions: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < profile.nodes; i++) {
    const theta = Math.acos(1 - 2 * random());
    const phi = (random() - 0.5) * Math.PI;
    const point = cortexPoint(
      theta,
      phi,
      i % 2 ? -1 : 1,
      0.024 + random() * 0.009,
    );
    nodePositions.push(point.x, point.y, point.z);
    sizes.push(0.55 + random() * 0.85);
    seeds.push(random());
  }
  nodes.setAttribute('position', new Float32BufferAttribute(nodePositions, 3));
  nodes.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  nodes.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  nodes.computeBoundingSphere();
  const pulses = new BufferGeometry();
  const pulseCount = profile.paths * 3;
  pulses.setAttribute(
    'position',
    new Float32BufferAttribute(new Float32Array(pulseCount * 3), 3),
  );
  pulses.setAttribute(
    'aPath',
    new Float32BufferAttribute(
      Array.from({ length: pulseCount }, (_, i) => Math.floor(i / 3)),
      1,
    ),
  );
  pulses.setAttribute(
    'aPhase',
    new Float32BufferAttribute(
      Array.from(
        { length: pulseCount },
        (_, i) => (i % 3) / 3 + random() * 0.04,
      ),
      1,
    ),
  );
  return {
    left,
    right,
    fibers,
    nodes,
    pulses,
    paths,
    profile,
    dispose() {
      left.dispose();
      right.dispose();
      fibers.dispose();
      nodes.dispose();
      pulses.dispose();
      paths.dispose();
    },
  };
}
