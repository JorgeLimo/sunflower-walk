import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

const RADIUS = 140;

const VERTEX = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  varying float vTwinkle;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 0.65 + 0.35 * sin(uTime * 1.6 + aPhase);
    vTwinkle = twinkle;
    gl_PointSize = aSize * twinkle * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.0, d) * uOpacity * vTwinkle;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

interface StarsProps {
  count: number;
}

/** Muchas estrellas pequeñas repartidas de forma natural en el hemisferio
 * superior del cielo, con un titileo sutil por estrella (vía shader). */
export function Stars({ count }: StarsProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;

  const { positions, phases, sizes } = useMemo(() => {
    const random = createSeededRandom(909);
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const phi = randomBetween(random, 0, Math.PI * 0.48);
      pos[i * 3] = RADIUS * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = RADIUS * Math.cos(phi);
      pos[i * 3 + 2] = RADIUS * Math.sin(phi) * Math.sin(theta);
      phase[i] = random() * Math.PI * 2;
      size[i] = randomBetween(random, 1, random() < 0.12 ? 3.2 : 1.8);
    }
    return { positions: pos, phases: phase, sizes: size };
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    const distance = scrollState.current.smoothDistance;
    getSkyState(getCycleProgress(distance), skyState);

    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uOpacity.value = skyState.starOpacity;
    void materialRef;
  });

  return (
    <group ref={groupRef} position={[0, 0, CHARACTER_Z]}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
          <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          transparent
          depthWrite={false}
          fog={false}
        />
      </points>
    </group>
  );
}
