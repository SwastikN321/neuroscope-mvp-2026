export const SIGNAL_DURATION_MS = 12000;

/** Shared timing contract for GPU fibers and their attached particles. */
export const activityGLSL = `
  uniform float uTime;
  uniform float uActivity;
  float impulse(float progress, float region) {
    float clock = mod(uTime - mod(region, 6.0) * 0.6 + 8.4, 8.4);
    float head = (clock - 0.65) / (2.8 + mod(region, 3.0) * 0.24);
    float d = progress - head;
    float core = exp(-d * d * 2100.0);
    float tail = exp(-d * d * 85.0) * (1.0 - smoothstep(-0.14, 0.025, d));
    return (core + tail * 0.45) * step(clock, 4.5) * uActivity;
  }
`;
