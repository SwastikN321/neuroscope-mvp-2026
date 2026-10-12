/* eslint react-hooks/immutability: off -- Three.js owns mutable scene, camera, and GPU objects. Mutations are confined to effects and the R3F frame loop. */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  Group,
  Euler,
  Quaternion,
  MathUtils,
  PMREMGenerator,
  ShaderMaterial,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSculpture, profiles, type Quality } from './geometry';
import {
  fiberVertex,
  fiberFragment,
  nodeVertex,
  nodeFragment,
  pulseVertex,
  pulseFragment,
} from './shaders';
import type { SceneInput } from './sceneState';

type Props = {
  input: RefObject<SceneInput>;
  quality: Quality;
  running: boolean;
  onReady: () => void;
  onFailure: () => void;
};

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new PMREMGenerator(gl as WebGLRenderer);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.035);
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
    const shaderError = gl.debug.onShaderError;
    function lost(event: Event) {
      event.preventDefault();
      onFailure();
    }
    canvas.addEventListener('webglcontextlost', lost);
    gl.debug.onShaderError = () => {
      if (import.meta.env.DEV)
        console.error(
          'NeuroScope shader initialization failed; switching to the still artwork.',
        );
      onFailure();
    };
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      gl.debug.onShaderError = shaderError;
    };
  }, [gl, onFailure]);
  return null;
}

function Sculpture({
  input,
  quality,
  onReady,
  onSlow,
}: Pick<Props, 'input' | 'quality' | 'onReady'> & { onSlow: () => void }) {
  const model = useMemo(() => createSculpture(quality), [quality]);
  const group = useRef<Group>(null);
  const fibers = useRef<ShaderMaterial>(null);
  const nodes = useRef<ShaderMaterial>(null);
  const pulses = useRef<ShaderMaterial>(null);
  const frame = useRef({
    time: 0,
    elapsed: 0,
    count: 0,
    total: 0,
    ready: false,
    measured: false,
    pointerX: 0,
    pointerY: 0,
    dragging: false,
    dragIdle: 0,
  });
  const { camera, gl } = useThree();
  const orientation = useMemo(
    () => ({
      base: new Quaternion().setFromEuler(new Euler(0.28, -0.58, -0.13)),
      target: new Quaternion(),
      interaction: new Quaternion(),
      sway: new Quaternion(),
      angles: new Euler(),
    }),
    [],
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0 },
      uReveal: { value: 0 },
      uDpr: { value: profiles[quality].dpr },
      uPaths: { value: model.paths },
      uPathCount: { value: model.profile.paths },
      uSamples: { value: model.profile.samples },
    }),
    [model, quality],
  );
  useEffect(() => () => model.dispose(), [model]);

  useFrame((_, dt) => {
    const state = frame.current;
    const step = Math.min(dt, 0.05);
    state.elapsed += step;
    if (!input.current.paused) state.time += step;
    const reveal = MathUtils.smoothstep(state.elapsed, 0.05, 1.8);
    const activity = input.current.activity ? 1 : 0;
    for (const material of [fibers.current, nodes.current, pulses.current]) {
      if (!material) continue;
      material.uniforms.uTime!.value = state.time;
      material.uniforms.uReveal!.value = reveal;
      material.uniforms.uActivity!.value = MathUtils.damp(
        material.uniforms.uActivity!.value as number,
        activity,
        3,
        step,
      );
      material.uniforms.uDpr!.value = gl.getPixelRatio();
    }
    if (group.current) {
      if (input.current.dragging && !state.dragging)
        state.dragIdle = Math.sin(state.time * 0.13) * 0.065;
      state.dragging = input.current.dragging;
      const idle = input.current.dragging
        ? state.dragIdle
        : Math.sin(state.time * 0.13) * 0.065;
      state.pointerX = MathUtils.damp(
        state.pointerX,
        input.current.pointerX,
        8,
        step,
      );
      state.pointerY = MathUtils.damp(
        state.pointerY,
        input.current.pointerY,
        8,
        step,
      );
      orientation.interaction.fromArray(input.current.rotation);
      orientation.sway.setFromEuler(
        orientation.angles.set(
          state.pointerY * 0.045,
          state.pointerX * 0.1 + idle,
          0,
        ),
      );
      orientation.target
        .copy(orientation.sway)
        .multiply(orientation.interaction)
        .multiply(orientation.base);
      group.current.quaternion.slerp(
        orientation.target,
        1 - Math.exp(-(input.current.dragging ? 22 : 12) * step),
      );
      const breathe = 1 + Math.sin(state.time * 0.7) * 0.004;
      group.current.scale.setScalar(breathe * (0.97 + 0.03 * reveal));
      group.current.position.y = Math.sin(state.time * 0.35) * 0.025;
    }
    // A deliberately tiny, non-hijacking camera response. This normalized scroll
    // channel is the boundary for the later camera-to-waveform sequence.
    camera.position.z = MathUtils.damp(
      camera.position.z,
      6.55 - input.current.scroll * 0.22,
      3,
      step,
    );
    if (!state.ready) {
      state.ready = true;
      onReady();
    }
    if (state.elapsed > 1.5 && !state.measured && quality === 'full') {
      if (dt > 0.15) return;
      state.count++;
      state.total += dt;
      if (state.count >= 30) {
        state.measured = true;
        if (state.total / state.count > 0.023) onSlow();
      }
    }
  });

  return (
    <group ref={group} rotation={[0.28, -0.58, -0.13]}>
      {[model.left, model.right].map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshPhysicalMaterial
            color="#a0b1be"
            vertexColors
            metalness={0.55}
            roughness={0.36}
            clearcoat={0.55}
            clearcoatRoughness={0.3}
            envMapIntensity={0.85}
          />
        </mesh>
      ))}
      <lineSegments geometry={model.fibers}>
        <shaderMaterial
          ref={fibers}
          uniforms={uniforms}
          vertexShader={fiberVertex}
          fragmentShader={fiberFragment}
          transparent
          depthWrite={false}
        />
      </lineSegments>
      <points geometry={model.nodes}>
        <shaderMaterial
          ref={nodes}
          uniforms={uniforms}
          vertexShader={nodeVertex}
          fragmentShader={nodeFragment}
          transparent
          depthWrite={false}
        />
      </points>
      <points geometry={model.pulses} frustumCulled={false}>
        <shaderMaterial
          ref={pulses}
          uniforms={uniforms}
          vertexShader={pulseVertex}
          fragmentShader={pulseFragment}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}

export default function NeuralCanvas({
  input,
  quality,
  running,
  onReady,
  onFailure,
}: Props) {
  const [lowerQuality, setLowerQuality] = useState(false);
  const selected = lowerQuality ? 'compact' : quality;
  return (
    <Canvas
      camera={{ position: [0, 0, 6.55], fov: 36, near: 0.1, far: 30 }}
      dpr={[1, profiles[selected].dpr]}
      frameloop={running ? 'always' : 'never'}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#06080d', 0);
      }}
      fallback={null}
    >
      <StudioEnvironment />
      <ContextLifecycle onFailure={onFailure} />
      <ambientLight intensity={0.18} />
      <directionalLight position={[-3, 5, 4]} color="#d6f7ff" intensity={3.1} />
      <directionalLight position={[4, 1, -2]} color="#4278ff" intensity={3.8} />
      <directionalLight
        position={[-2, -1, -3]}
        color="#a48aff"
        intensity={1.4}
      />
      <pointLight
        position={[1, 3, 2]}
        color="#49dceb"
        intensity={6}
        distance={9}
        decay={2}
      />
      <Sculpture
        input={input}
        quality={selected}
        onReady={onReady}
        onSlow={() => setLowerQuality(true)}
      />
    </Canvas>
  );
}
