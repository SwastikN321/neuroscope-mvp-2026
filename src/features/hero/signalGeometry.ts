import {
  BufferGeometry,
  Float32BufferAttribute,
  type BufferAttribute,
} from 'three';
import { networkPoint, signalPoint, channelNames } from './journey';
import type { Quality } from './anatomy';

/** Allocate morph destinations only on load/resize, never in the render loop. */
export function setMorphTargets(
  geometry: BufferGeometry,
  aspect: number,
  particles: boolean,
) {
  const routes = geometry.getAttribute('aRoute') as BufferAttribute;
  const network = new Float32Array(routes.count * 3);
  const signal = new Float32Array(routes.count * 3);
  for (let i = 0; i < routes.count; i++) {
    const t = routes.getX(i),
      channel = Math.floor(routes.getY(i)) % 6;
    const strand = particles
      ? i % 71
      : geometry.getAttribute('aStrand').getX(i);
    const n = networkPoint(t, channel, strand),
      s = signalPoint(channel, t, aspect);
    const side = particles ? 0 : routes.getZ(i) * 0.003;
    network.set([n[0], n[1] + side, n[2]], i * 3);
    signal.set([s[0], s[1] + side, s[2]], i * 3);
  }
  for (const [name, values] of [
    ['aNetwork', network],
    ['aSignal', signal],
  ] as const) {
    const attribute = geometry.getAttribute(name) as
      BufferAttribute | undefined;
    if (attribute && attribute.array.length === values.length) {
      attribute.array.set(values);
      attribute.needsUpdate = true;
    } else geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
  }
}
export function createSignalGeometry(quality: Quality, aspect: number) {
  const count = quality === 'full' ? 1280 : 640;
  const positions: number[] = [],
    coordinates: number[] = [],
    indices: number[] = [];
  channelNames.forEach((_, channel) => {
    const base = positions.length / 3;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1),
        p = signalPoint(channel, t, aspect);
      const before = signalPoint(
        channel,
        Math.max(0, t - 1 / (count - 1)),
        aspect,
      );
      const after = signalPoint(
        channel,
        Math.min(1, t + 1 / (count - 1)),
        aspect,
      );
      const dx = after[0] - before[0],
        dy = after[1] - before[1],
        length = Math.hypot(dx, dy);
      for (const side of [-1, 1]) {
        positions.push(
          p[0] - (dy / length) * side * 0.013,
          p[1] + (dx / length) * side * 0.013,
          p[2],
        );
        coordinates.push(t, channel, side);
      }
      if (i < count - 1) {
        const j = base + i * 2;
        indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'aSignalRoute',
    new Float32BufferAttribute(coordinates, 3),
  );
  geometry.setIndex(indices);
  return geometry;
}
export const morphGLSL = `
  uniform float uNetwork; uniform float uSignal;
  attribute vec3 aNetwork; attribute vec3 aSignal;
  vec3 morphPosition(vec3 source) {
    vec3 world = (modelMatrix * vec4(source,1.)).xyz;
    return mix(mix(world,aNetwork,uNetwork),aSignal,uSignal);
  }
`;
