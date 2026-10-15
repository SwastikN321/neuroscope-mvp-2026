/** Pure, reversible choreography. All distances are relative to the fitted view. */
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export function interval(start: number, end: number, progress: number) {
  const t = clamp01((progress - start) / (end - start));
  return t * t * (3 - 2 * t);
}
export function journeyState(progress: number) {
  const p = clamp01(progress);
  return {
    progress: p,
    approach: interval(0.03, 0.57, p),
    center: interval(0.04, 0.35, p),
    network: interval(0.17, 0.55, p),
    signal: interval(0.55, 0.91, p),
    cortex: 1 - interval(0.23, 0.46, p),
    heroText: 1 - interval(0.07, 0.24, p),
    networkText: interval(0.34, 0.43, p) * (1 - interval(0.61, 0.71, p)),
    signalText: interval(0.7, 0.86, p),
    activity: interval(0.015, 0.16, p) * (1 - interval(0.84, 1, p)),
  };
}
export const channelNames = ['Fp1', 'F3', 'C3', 'P3', 'O1', 'F4'] as const;

/** Deterministic colored spectral mixture, not patient data or a diagnostic simulation. */
export function syntheticEEG(channel: number, seconds: number) {
  let value = 0;
  for (let i = 0; i < 24; i++) {
    const frequency = 1.3 + i * 1.217;
    const phase = Math.sin((i + 1) * 12.9898 + channel * 78.233) * 43758.5453;
    value +=
      (Math.sin(seconds * Math.PI * 2 * frequency + phase) /
        Math.sqrt(frequency)) *
      0.13;
  }
  const envelope = Math.exp(
    -Math.pow((seconds - 2.1 - channel * 0.53) / 1.1, 2),
  );
  value +=
    Math.sin(seconds * Math.PI * 2 * (9.2 + channel * 0.31)) * envelope * 0.23;
  return Math.tanh(value * 1.25);
}

export function signalLayout(aspect: number) {
  const mobile = aspect < 1;
  // Camera settles at z=8.5 with a 34 degree vertical field of view.
  const height = 2 * 8.5 * Math.tan((34 * Math.PI) / 360);
  const width = height * aspect;
  return {
    mobile,
    left: width * (mobile ? -0.36 : -0.015),
    width: width * (mobile ? 0.77 : 0.45),
    top: height * (mobile ? 0.025 : 0.2),
    spacing: height * (mobile ? 0.061 : 0.093),
    amplitude: height * (mobile ? 0.036 : 0.052),
  };
}
export function signalPoint(
  channel: number,
  t: number,
  aspect: number,
  timeOffset = 0,
) {
  const layout = signalLayout(aspect);
  return [
    layout.left + t * layout.width,
    layout.top -
      channel * layout.spacing +
      syntheticEEG(channel, t * 8 + timeOffset) * layout.amplitude,
    -channel * 0.055,
  ] as const;
}

export function networkPoint(t: number, channel: number, strand: number) {
  const angle = (channel / 6) * Math.PI * 2 + t * 2.8 + strand * 0.037;
  const radius = 1.1 + (strand % 7) * 0.17 + Math.sin(t * Math.PI) * 0.7;
  return [
    Math.cos(angle) * radius + Math.sin(t * 4.5) * 0.45,
    Math.sin(angle) * radius * 0.72,
    3.2 - t * 15 + Math.sin(strand * 1.4) * 0.18,
  ] as const;
}

/** Small deterministic interpolation between two synthetic time windows. */
export function signalMotion(seconds: number) {
  return (1 - Math.cos(seconds * 0.45)) * 0.5;
}
