export const fiberVertex = `
  attribute float aProgress;
  attribute float aPath;
  varying float vProgress;
  varying float vPath;
  varying float vDepth;
  void main() {
    vProgress = aProgress;
    vPath = aPath;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;
export const fiberFragment = `
  uniform float uTime;
  uniform float uActivity;
  uniform float uReveal;
  varying float vProgress;
  varying float vPath;
  varying float vDepth;
  void main() {
    float phase = fract(vProgress - uTime * (0.055 + 0.035 * uActivity) + vPath * 0.173);
    float pulse = exp(-pow(min(phase, 1.0 - phase) * 65.0, 2.0));
    float selected = step(0.70, fract(vPath * 0.618));
    vec3 base = mix(vec3(0.055, 0.13, 0.19), vec3(0.17, 0.32, 0.38), fract(vPath * 0.137));
    vec3 light = mix(vec3(0.19, 0.47, 0.85), vec3(0.45, 0.98, 1.0), selected);
    vec3 color = base + light * pulse * (0.45 + uActivity * 1.0) * selected;
    float depth = 1.0 - smoothstep(4.0, 10.0, vDepth);
    gl_FragColor = vec4(color * depth * uReveal, 0.66 * uReveal);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const nodeVertex = `
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uActivity;
  uniform float uDpr;
  varying float vLight;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    vLight = 0.15 + 0.18 * aSeed + 0.28 * uActivity * pow(max(0.0, sin(uTime * 0.8 + aSeed * 50.0)), 10.0);
    gl_PointSize = clamp(aSize * uDpr * 9.0 / -view.z, 0.6, 3.0);
  }
`;
export const nodeFragment = `
  uniform float uReveal;
  varying float vLight;
  void main() {
    float radius = length(gl_PointCoord - 0.5);
    if (radius > 0.5) discard;
    float alpha = smoothstep(0.5, 0.10, radius);
    gl_FragColor = vec4(vec3(0.50, 0.85, 0.94) * vLight * uReveal, alpha * uReveal * 0.6);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const pulseVertex = `
  attribute float aPath;
  attribute float aPhase;
  uniform sampler2D uPaths;
  uniform float uPathCount;
  uniform float uSamples;
  uniform float uTime;
  uniform float uActivity;
  uniform float uDpr;
  varying float vLight;
  void main() {
    float phase = fract(aPhase + uTime * (0.055 + uActivity * 0.035) + aPath * 0.173);
    float sampleIndex = phase * (uSamples - 1.0);
    float row = (aPath + 0.5) / uPathCount;
    vec3 a = texture2D(uPaths, vec2((floor(sampleIndex) + 0.5) / uSamples, row)).xyz;
    vec3 b = texture2D(uPaths, vec2((min(floor(sampleIndex) + 1.0, uSamples - 1.0) + 0.5) / uSamples, row)).xyz;
    vec3 point = mix(a, b, fract(sampleIndex));
    vec4 view = modelViewMatrix * vec4(point, 1.0);
    gl_Position = projectionMatrix * view;
    vLight = step(0.70, fract(aPath * 0.618));
    gl_PointSize = (8.0 + uActivity * 8.0) * uDpr * 3.5 / -view.z;
  }
`;
export const pulseFragment = `
  uniform float uReveal;
  varying float vLight;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5 || vLight < 0.5) discard;
    float glow = exp(-r * r * 18.0);
    float core = exp(-r * r * 160.0);
    gl_FragColor = vec4(mix(vec3(0.15, 0.67, 0.88), vec3(0.78, 1.0, 1.0), core), glow * 0.65 * uReveal);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
