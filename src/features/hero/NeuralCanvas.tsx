/* eslint react-hooks/immutability: off -- Three.js owns mutable scene, camera, and GPU objects. */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Group,
  Euler,
  Quaternion,
  MathUtils,
  PMREMGenerator,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  anatomyProfiles,
  fitAnatomy,
  inspectAnatomy,
  type Quality,
} from './anatomy';
import type { SceneInput } from './sceneState';
import { createNeuralEffects, type NeuralAsset } from './neuralEffects';

type Props = {
  input: RefObject<SceneInput>;
  quality: Quality;
  running: boolean;
  onLoading: () => void;
  onReady: () => void;
  onFailure: () => void;
};
type Model = {
  scene: Group;
  radius: number;
  triangles: number;
  effects: ReturnType<typeof createNeuralEffects>;
};

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.06);
    const previous = scene.environment;
    scene.environment = target.texture;
    room.dispose();
    generator.dispose();
    return () => {
      scene.environment = previous;
      target.dispose();
    };
  }, [gl, scene]);
  return null;
}

function ContextLifecycle({ onFailure }: Pick<Props, 'onFailure'>) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const previous = gl.debug.onShaderError;
    function lost(event: Event) {
      event.preventDefault();
      onFailure();
    }
    canvas.addEventListener('webglcontextlost', lost);
    gl.debug.onShaderError = () => onFailure();
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      gl.debug.onShaderError = previous;
    };
  }, [gl, onFailure]);
  return null;
}

function Sculpture({
  input,
  quality,
  onLoading,
  onReady,
  onFailure,
  onSlow,
}: Omit<Props, 'running'> & { onSlow: () => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const group = useRef<Group>(null);
  const { camera, gl, size, invalidate } = useThree();
  const frame = useRef({
    time: 0,
    signalTime: 0,
    signal: false,
    count: 0,
    total: 0,
    ready: false,
    measured: false,
    pointerX: 0,
    pointerY: 0,
    idle: 0,
  });
  const orientation = useMemo(
    () => ({
      base: new Quaternion().setFromEuler(new Euler(0.12, 2.38, -0.12)),
      target: new Quaternion(),
      interaction: new Quaternion(),
      sway: new Quaternion(),
      angles: new Euler(),
    }),
    [],
  );

  useEffect(() => {
    onLoading();
    const controller = new AbortController();
    let disposed = false;
    let release: (() => void) | undefined;
    async function load() {
      const response = await fetch(anatomyProfiles[quality].url, {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          `Anatomical model request failed (${response.status}).`,
        );
      const data = await response.arrayBuffer();
      if (disposed) return;
      const gltf = await new GLTFLoader().parseAsync(data, '/models/');
      const geometries = new Set<import('three').BufferGeometry>();
      const materials = new Set<import('three').Material>();
      gltf.scene.traverse((object) => {
        const mesh = object as import('three').Mesh;
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        (Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        ).forEach((m) => materials.add(m));
      });
      const material = new MeshPhysicalMaterial({
        color: '#071724',
        metalness: 0.65,
        roughness: 0.48,
        clearcoat: 0.08,
        clearcoatRoughness: 0.38,
        envMapIntensity: 0.07,
        // Opaque pearl finish: no expensive transmission render pass.
      });
      // Assigned after the asynchronous neural asset request; cleanup can run earlier.
      // eslint-disable-next-line prefer-const
      let effects: ReturnType<typeof createNeuralEffects> | undefined;
      release = () => {
        effects?.dispose();
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((m) => m.dispose());
        material.dispose();
      };
      if (disposed) {
        release();
        return;
      }
      const anatomy = inspectAnatomy(gltf.scene, quality);
      anatomy.meshes.forEach((mesh) => {
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      materials.forEach((m) => m.dispose());
      materials.clear();
      gltf.scene.position.copy(anatomy.sphere.center).multiplyScalar(-1);
      // Tighter sphere from actual vertices, rather than empty box corners.
      let radius = 0;
      anatomy.meshes.forEach((mesh) => {
        const p = mesh.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++)
          radius = Math.max(
            radius,
            Math.hypot(
              p.getX(i) - anatomy.sphere.center.x,
              p.getY(i) - anatomy.sphere.center.y,
              p.getZ(i) - anatomy.sphere.center.z,
            ),
          );
      });
      const neuralResponse = await fetch(`/models/neural-${quality}.json`, {
        signal: controller.signal,
      });
      if (!neuralResponse.ok) throw new Error('Neural asset request failed');
      const neuralAsset = (await neuralResponse.json()) as NeuralAsset;
      if (disposed) return;
      effects = createNeuralEffects(neuralAsset, anatomy.meshes, quality);
      const neural = effects;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uHotspots = neural.uniforms.uHotspots;
        shader.vertexShader =
          'varying vec3 vCortexPosition;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvCortexPosition = position;',
          );
        shader.fragmentShader =
          'varying vec3 vCortexPosition; uniform vec4 uHotspots[6];\n' +
          shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `
          #include <emissivemap_fragment>
          float edgeLight = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.4);
          totalEmissiveRadiance += vec3(0.008, 0.09, 0.16) * edgeLight;
          for (int i = 0; i < 6; i++) {
            vec3 delta = vCortexPosition - uHotspots[i].xyz;
            totalEmissiveRadiance += vec3(0.02, 0.62, 0.95) * exp(-dot(delta,delta)*110.0) * uHotspots[i].w;
          }
        `,
          );
      };
      material.customProgramCacheKey = () => 'cortex-pearl-rim-v2';
      gltf.scene.add(effects.group);
      setModel({
        scene: gltf.scene,
        radius,
        triangles: anatomy.triangles,
        effects,
      });
      invalidate();
    }
    void load().catch((error: unknown) => {
      if (
        disposed ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        return;
      release?.();
      onFailure();
    });
    return () => {
      disposed = true;
      controller.abort();
      release?.();
    };
  }, [quality, onLoading, onFailure, invalidate]);

  useEffect(() => {
    if (!model || !(camera instanceof PerspectiveCamera)) return;
    fitAnatomy(camera, model.radius, size.width / Math.max(1, size.height));
    // Read-only diagnostics for browser QA; no scene objects exposed globally.
    gl.domElement.dataset.model = anatomyProfiles[quality].url;
    gl.domElement.dataset.triangles = String(model.triangles);
    gl.domElement.dataset.hemispheres = '2';
    gl.domElement.dataset.fibers = String(model.effects.fibers);
    gl.domElement.dataset.particles = String(model.effects.particles);
    invalidate();
    return () => {
      delete gl.domElement.dataset.model;
      delete gl.domElement.dataset.triangles;
      delete gl.domElement.dataset.hemispheres;
      delete gl.domElement.dataset.fibers;
      delete gl.domElement.dataset.particles;
    };
  }, [model, camera, size.width, size.height, gl, quality, invalidate]);

  useFrame((_, dt) => {
    if (!model || !group.current) return;
    const state = frame.current;
    const step = Math.min(dt, 0.05);
    if (!input.current.paused) state.time += step;
    const uniforms = model.effects.uniforms;
    if (input.current.signal && !state.signal) state.signalTime = 0;
    state.signal = input.current.signal;
    if (!input.current.paused) state.signalTime += step;
    const activity = MathUtils.damp(
      uniforms.uActivity.value,
      input.current.signal ? 1 : 0,
      3.5,
      step,
    );
    model.effects.update(state.signalTime, activity, gl.getPixelRatio());
    gl.domElement.dataset.activity = uniforms.uActivity.value.toFixed(3);
    if (!input.current.dragging) state.idle = Math.sin(state.time * 0.12) * 0.1;
    state.pointerX = MathUtils.damp(
      state.pointerX,
      input.current.pointerX,
      5,
      step,
    );
    state.pointerY = MathUtils.damp(
      state.pointerY,
      input.current.pointerY,
      5,
      step,
    );
    orientation.interaction.fromArray(input.current.rotation);
    orientation.sway.setFromEuler(
      orientation.angles.set(
        state.pointerY * 0.045,
        state.pointerX * 0.07 + state.idle,
        0,
      ),
    );
    orientation.target
      .copy(orientation.sway)
      .multiply(orientation.interaction)
      .multiply(orientation.base);
    group.current.quaternion.slerp(
      orientation.target,
      1 - Math.exp(-(input.current.dragging ? 20 : 9) * step),
    );
    if (!state.ready) {
      state.ready = true;
      onReady();
    }
    if (import.meta.env.DEV) {
      gl.domElement.dataset.rotation = group.current.quaternion
        .toArray()
        .map((n) => n.toFixed(4))
        .join(',');
      gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
      gl.domElement.dataset.frameMs = (dt * 1000).toFixed(1);
    }
    if (state.time > 3 && !state.measured && quality === 'full' && dt < 0.15) {
      state.count++;
      state.total += dt;
      if (state.count >= 90) {
        state.measured = true;
        if (state.total / state.count > 0.032) onSlow();
      }
    }
  });

  return (
    <group ref={group} quaternion={orientation.base}>
      {model && <primitive object={model.scene} />}
    </group>
  );
}

export default function NeuralCanvas({
  input,
  quality,
  running,
  onLoading,
  onReady,
  onFailure,
}: Props) {
  const [lowerQuality, setLowerQuality] = useState(false);
  const selected = lowerQuality ? 'compact' : quality;
  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 34, near: 0.1, far: 30 }}
      dpr={[1, anatomyProfiles[selected].dpr]}
      frameloop={running ? 'always' : 'demand'}
      shadows={{ type: PCFSoftShadowMap }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#06080d', 0);
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;
      }}
      fallback={null}
    >
      <StudioEnvironment />
      <ContextLifecycle onFailure={onFailure} />
      <ambientLight intensity={0.12} />
      <directionalLight
        position={[-3, 5, 4]}
        color="#d7eaff"
        intensity={1.65}
        castShadow
        shadow-mapSize={[
          anatomyProfiles[selected].shadow,
          anatomyProfiles[selected].shadow,
        ]}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-2.5}
        shadow-camera-near={0.5}
        shadow-camera-far={14}
        shadow-bias={-0.00008}
        shadow-normalBias={0.008}
      />
      <directionalLight position={[4, 0, 3]} color="#4b9bab" intensity={0.65} />
      <directionalLight position={[2, 3, -3]} color="#9e8bcc" intensity={2.4} />
      <directionalLight
        position={[-3, -0.5, -2]}
        color="#4ba7b7"
        intensity={1.1}
      />
      <Sculpture
        key={selected}
        input={input}
        quality={selected}
        onLoading={onLoading}
        onReady={onReady}
        onFailure={onFailure}
        onSlow={() => setLowerQuality(true)}
      />
    </Canvas>
  );
}
