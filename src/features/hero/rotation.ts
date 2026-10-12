export type Rotation = [number, number, number, number];
export type TrackPoint = [number, number, number];

export function trackPoint(x: number, y: number): TrackPoint {
  const squared = x * x + y * y;
  // A sphere joined smoothly to a hyperbolic sheet avoids the sudden angular
  // acceleration of a hemisphere clipped at its rim.
  const z = squared <= 0.5 ? Math.sqrt(1 - squared) : 0.5 / Math.sqrt(squared);
  const inverse = 1 / Math.hypot(x, y, z);
  return [x * inverse, y * inverse, z * inverse];
}

function normalized(rotation: Rotation): Rotation {
  const length = Math.hypot(...rotation);
  return rotation.map((value) => value / length) as Rotation;
}

// Compose rotations in camera/screen space, avoiding Euler singularities.
export function composeRotation(a: Rotation, b: Rotation): Rotation {
  return normalized([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]);
}

export function dragRotation(
  previous: TrackPoint,
  next: TrackPoint,
  current: Rotation,
): Rotation {
  const w =
    1 + previous[0] * next[0] + previous[1] * next[1] + previous[2] * next[2];
  const delta: Rotation =
    w < 1e-8
      ? normalized(
          Math.abs(previous[0]) > Math.abs(previous[2])
            ? [-previous[1], previous[0], 0, 0]
            : [0, -previous[2], previous[1], 0],
        )
      : normalized([
          previous[1] * next[2] - previous[2] * next[1],
          previous[2] * next[0] - previous[0] * next[2],
          previous[0] * next[1] - previous[1] * next[0],
          w,
        ]);
  return composeRotation(delta, current);
}

export function keyboardRotation(
  current: Rotation,
  x: number,
  y: number,
): Rotation {
  const horizontal: Rotation = [0, Math.sin(y / 2), 0, Math.cos(y / 2)];
  const vertical: Rotation = [Math.sin(x / 2), 0, 0, Math.cos(x / 2)];
  return composeRotation(vertical, composeRotation(horizontal, current));
}
