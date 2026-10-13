import {
  AdditiveBlending,
  NormalBlending,
  DoubleSide,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Mesh as AnatomyMesh,
} from 'three';
import type { Quality } from './anatomy';
import { activityGLSL } from './neuralActivity';
import { journeyState } from './journey';
import {
  createSignalGeometry,
  setMorphTargets,
  morphGLSL,
} from './signalGeometry';

export type NeuralPath = {
  region: number;
  lane: number;
  positions: number[];
  normals: number[];
};
export type NeuralAsset = {
  version: number;
  quality: Quality;
  paths: NeuralPath[];
  maxSurfaceDistance: number;
};
export const particleCounts = { full: 28000, compact: 9000 };

export function validateNeuralAsset(asset: NeuralAsset, quality: Quality) {
  if (
    asset.version !== 1 ||
    asset.quality !== quality ||
    asset.paths.length < 30 ||
    asset.maxSurfaceDistance > 0.011
  )
    throw new Error('Invalid neural surface asset');
  for (const path of asset.paths) {
    if (
      path.positions.length < 6 ||
      path.positions.length % 3 ||
      path.positions.length !== path.normals.length ||
      !Number.isInteger(path.region) ||
      path.region < 0 ||
      path.region > 11
    )
      throw new Error('Invalid neural route');
    if (
      !path.positions.every(Number.isFinite) ||
      !path.normals.every(Number.isFinite)
    )
      throw new Error('Nonfinite neural route');
    for (let i = 0; i < path.positions.length; i += 3) {
      if (
        Math.hypot(...path.positions.slice(i, i + 3)) > 2.5 ||
        Math.abs(Math.hypot(...path.normals.slice(i, i + 3)) - 1) > 0.002
      )
        throw new Error('Invalid neural bounds or normal');
    }
  }
  return asset;
}

function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Two batched draw calls. All coordinates live in the original GLB frame. */
export function createNeuralEffects(
  asset: NeuralAsset,
  meshes: AnatomyMesh[],
  quality: Quality,
) {
  validateNeuralAsset(asset, quality);
  const random = randomSource(2404);
  const uniforms = {
    uTime: { value: 0 },
    uNetwork: { value: 0 },
    uSignal: { value: 0 },
    uFiberFade: { value: 1 },
    uWaveReveal: { value: 0 },
    uHotspots: { value: Array.from({ length: 6 }, () => new Vector4()) },
    uActivity: { value: 0 },
    uPixelRatio: { value: 1 },
  };
  const positions: number[] = [],
    coordinates: number[] = [],
    indices: number[] = [],
    strands: number[] = [];
  const p = new Vector3(),
    n = new Vector3(),
    tangent = new Vector3(),
    side = new Vector3();
  const anchors: { p: Vector3; progress: number; region: number }[] = [];
  for (const [pathID, path] of asset.paths.entries()) {
    const count = path.positions.length / 3;
    const base = positions.length / 3;
    for (let i = 0; i < count; i++) {
      p.fromArray(path.positions, i * 3);
      n.fromArray(path.normals, i * 3);
      tangent
        .fromArray(path.positions, Math.min(i + 1, count - 1) * 3)
        .sub(new Vector3().fromArray(path.positions, Math.max(0, i - 1) * 3));
      side
        .crossVectors(tangent, n)
        .normalize()
        .multiplyScalar(path.lane === 0 ? 0.003 : 0.0016);
      for (const sign of [-1, 1]) {
        positions.push(
          p.x + side.x * sign,
          p.y + side.y * sign,
          p.z + side.z * sign,
        );
        strands.push(pathID);
        coordinates.push(
          i / (count - 1),
          path.region,
          sign,
          path.lane === 0 ? 1 : 0.58,
        );
      }
      if (i < count - 1) {
        const j = base + i * 2;
        indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
      }
      if (i % 18 === 0 && path.lane === 0)
        anchors.push({
          p: p.clone(),
          progress: i / (count - 1),
          region: path.region,
        });
    }
  }
  const fibers = new BufferGeometry();
  fibers.setAttribute('position', new Float32BufferAttribute(positions, 3));
  fibers.setAttribute('aRoute', new Float32BufferAttribute(coordinates, 4));
  fibers.setIndex(indices);
  fibers.setAttribute('aStrand', new Float32BufferAttribute(strands, 1));
  const fiberMaterial = new ShaderMaterial({
    uniforms,
    side: DoubleSide,
    forceSinglePass: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `${morphGLSL} attribute vec4 aRoute; varying vec4 vRoute;
      void main(){ vRoute=aRoute; gl_Position=projectionMatrix*viewMatrix*vec4(morphPosition(position),1.); }`,
    fragmentShader: `${activityGLSL}
      varying vec4 vRoute; uniform float uFiberFade;
      void main(){
        float wave=impulse(vRoute.x,vRoute.y);
        vec3 quiet=mix(vec3(.01,.18,.32),vec3(.18,.07,.34),mod(vRoute.y,3.)/3.);
        vec3 color=quiet*.9 + vec3(.015,.65,1.)*wave*5.0;
        float edge=1.-pow(abs(vRoute.z),2.);
        gl_FragColor=vec4(color,edge*vRoute.w*(.3+uActivity*.65)*uFiberFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dots: number[] = [],
    routes: number[] = [];
  // Area-weighted triangle sampling avoids dense dots in heavily tessellated folds.
  const triangles: { mesh: AnatomyMesh; index: number; area: number }[] = [];
  let totalArea = 0;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position'),
      index = mesh.geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(pos, index.getX(i));
      b.fromBufferAttribute(pos, index.getX(i + 1));
      c.fromBufferAttribute(pos, index.getX(i + 2));
      totalArea += b.sub(a).cross(c.sub(a)).length() / 2;
      triangles.push({ mesh, index: i, area: totalArea });
    }
  }
  for (let i = 0; i < particleCounts[quality]; i++) {
    let progress: number, region: number;
    if (i % 4 === 0) {
      const path = asset.paths[Math.floor(random() * asset.paths.length)]!;
      const count = path.positions.length / 3;
      const t = random() * (count - 1),
        j = Math.min(count - 2, Math.floor(t));
      p.fromArray(path.positions, j * 3).lerp(
        a.fromArray(path.positions, (j + 1) * 3),
        t - j,
      );
      n.fromArray(path.normals, j * 3);
      p.addScaledVector(n, 0.002 + random() * 0.008);
      progress = t / (count - 1);
      region = path.region;
    } else {
      const target = random() * totalArea;
      let low = 0,
        high = triangles.length - 1;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (triangles[mid]!.area < target) low = mid + 1;
        else high = mid;
      }
      const { mesh, index: j } = triangles[low]!;
      const pos = mesh.geometry.getAttribute('position'),
        norm = mesh.geometry.getAttribute('normal'),
        index = mesh.geometry.index!;
      const u = Math.sqrt(random()),
        v = random(),
        weights = [1 - u, u * (1 - v), u * v];
      p.set(0, 0, 0);
      n.set(0, 0, 0);
      weights.forEach((w, k) => {
        const id = index.getX(j + k);
        p.addScaledVector(a.fromBufferAttribute(pos, id), w);
        n.addScaledVector(a.fromBufferAttribute(norm, id), w);
      });
      p.addScaledVector(n.normalize(), 0.008);
      let distance = Infinity,
        nearest = anchors[0]!;
      for (const anchor of anchors) {
        const d = p.distanceToSquared(anchor.p);
        if (d < distance) {
          distance = d;
          nearest = anchor;
        }
      }
      progress = nearest.progress;
      region = nearest.region;
    }
    dots.push(p.x, p.y, p.z);
    routes.push(progress, region, random(), i % 4 === 0 ? 1 : 0.8);
  }
  const particles = new BufferGeometry();
  particles.setAttribute('position', new Float32BufferAttribute(dots, 3));
  particles.setAttribute('aRoute', new Float32BufferAttribute(routes, 4));
  const particleMaterial = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `${activityGLSL} ${morphGLSL}
      uniform float uPixelRatio; attribute vec4 aRoute; varying float vWave; varying vec2 vStyle; varying float vDepth;
      void main(){
        vWave=impulse(aRoute.x,aRoute.y); vStyle=aRoute.zw;
        vec4 view=viewMatrix*vec4(morphPosition(position),1.);
        vDepth=smoothstep(.12,.8,-view.z);
        gl_PointSize=clamp((2.4+aRoute.z*2.6+vWave*8.)*uPixelRatio*5./(-view.z),1.,16.);
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: `uniform float uActivity; uniform float uSignal; varying float vWave; varying vec2 vStyle; varying float vDepth;
      void main(){
        float r=length(gl_PointCoord-.5)*2.; if(r>1.) discard;
        float core=exp(-r*r*16.); float halo=exp(-r*r*4.)*.18;
        vec3 color=mix(vec3(.10,.46,.8),vec3(.35,.14,.7),vStyle.x*.5)+vec3(.015,.65,1.)*vWave*2.5;
        float alpha=(core+halo)*(.48+vStyle.x*.42+vWave*.9)*vStyle.y*(.42+uActivity*.58);
        gl_FragColor=vec4(color,alpha*vDepth*mix(1.,.04+step(.86,vStyle.x)*.15,uSignal));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const waveMaterial = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    forceSinglePass: true,
    vertexShader: `attribute vec3 aSignalRoute; varying vec3 vRoute;
      void main(){vRoute=aSignalRoute; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uWaveReveal; uniform float uTime; varying vec3 vRoute;
      void main(){
        float edge=abs(vRoute.z); float core=exp(-edge*edge*8.); float halo=exp(-edge*edge*3.)*.14;
        float head=fract(uTime*.075-vRoute.y*.022);
        float pulse=exp(-pow(vRoute.x-head,2.)*280.);
        vec3 color=mix(vec3(.025,.48,.8),vec3(.43,.19,.8),vRoute.y/5.);
        color+=vec3(.06,.5,.7)*pulse;
        gl_FragColor=vec4(color*1.9,min(1.,core+halo)*uWaveReveal);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const wave = new Mesh(createSignalGeometry(quality, 1.6), waveMaterial);
  wave.renderOrder = 2;
  const group = new Group();
  group.name = 'Artistic surface activity';
  const fiberMesh = new Mesh(fibers, fiberMaterial),
    particleMesh = new Points(particles, particleMaterial);
  group.add(fiberMesh, particleMesh, wave);
  group.children.forEach((child) => {
    child.frustumCulled = false;
  });
  setMorphTargets(fibers, 1.6, false);
  setMorphTargets(particles, 1.6, true);
  return {
    group,
    uniforms,
    fibers: asset.paths.length,
    particles: particleCounts[quality],
    resize(aspect: number) {
      setMorphTargets(fibers, aspect, false);
      setMorphTargets(particles, aspect, true);
      wave.geometry.dispose();
      wave.geometry = createSignalGeometry(quality, aspect);
    },
    update(time: number, activity: number, pixelRatio: number, progress = 0) {
      const story = journeyState(progress);
      uniforms.uNetwork.value = story.network;
      uniforms.uSignal.value = story.signal;
      uniforms.uFiberFade.value = 1 - story.signal;
      uniforms.uWaveReveal.value = story.signal;
      wave.visible = story.signal > 0.001;
      fiberMesh.visible = story.signal < 0.999;
      uniforms.uTime.value = time;
      uniforms.uActivity.value = activity;
      uniforms.uPixelRatio.value = pixelRatio;
      uniforms.uHotspots.value.forEach((spot, i) => {
        const path = asset.paths.find(
          (path) => path.region === i * 2 && path.lane === 0,
        )!;
        if (!path) {
          spot.set(0, 0, 0, 0);
          return;
        }
        const region = i * 2;
        const clock = (time - (region % 6) * 0.6 + 8.4) % 8.4;
        const head = (clock - 0.65) / (2.8 + (region % 3) * 0.24);
        const count = path.positions.length / 3;
        const t = Math.max(0, Math.min(0.99999, head)) * (count - 1),
          j = Math.floor(t);
        p.fromArray(path.positions, j * 3).lerp(
          a.fromArray(path.positions, (j + 1) * 3),
          t - j,
        );
        spot.set(
          p.x,
          p.y,
          p.z,
          head > 0 && head < 1 ? activity * Math.sin(head * Math.PI) : 0,
        );
      });
    },
    dispose() {
      wave.geometry.dispose();
      waveMaterial.dispose();
      fibers.dispose();
      particles.dispose();
      fiberMaterial.dispose();
      particleMaterial.dispose();
    },
  };
}
