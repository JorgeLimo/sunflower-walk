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
  attribute float aBrightness;
  uniform float uTime;
  varying float vTwinkle;
  varying float vBrightness;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 0.68 + 0.32 * sin(uTime * 1.6 + aPhase);
    vTwinkle = twinkle;
    vBrightness = aBrightness;
    gl_PointSize = aSize * twinkle * (600.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;
  varying float vBrightness;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.0, d) * uOpacity * vTwinkle * vBrightness;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, min(alpha, 1.0));
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

  const { positions, phases, sizes, brightnesses } = useMemo(() => {
    const random = createSeededRandom(909);
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    const brightness = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const phi = randomBetween(random, 0, Math.PI * 0.49);
      pos[i * 3] = RADIUS * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = RADIUS * Math.cos(phi);
      pos[i * 3 + 2] = RADIUS * Math.sin(phi) * Math.sin(theta);
      phase[i] = random() * Math.PI * 2;
      // Tres niveles bien diferenciados: la mayoría chicas y tenues, un
      // grupo mediano algo más notorio, y un puñado de "destacadas" mucho
      // más grandes y brillantes — el cielo no debe verse parejo.
      const roll = random();
      if (roll < 0.05) {
        size[i] = randomBetween(random, 4.4, 6.8);
        brightness[i] = randomBetween(random, 1.3, 1.8);
      } else if (roll < 0.28) {
        size[i] = randomBetween(random, 2.6, 3.6);
        brightness[i] = randomBetween(random, 1.0, 1.3);
      } else {
        size[i] = randomBetween(random, 1.5, 2.3);
        brightness[i] = randomBetween(random, 0.7, 1.0);
      }
    }
    return { positions: pos, phases: phase, sizes: size, brightnesses: brightness };
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

    // Importante: se actualiza a través de `materialRef.current.uniforms`
    // (el objeto de uniforms REAL del material montado), no del objeto
    // `uniforms` de arriba — three.js clona ese objeto al crear el
    // material, así que mutar la copia local nunca llegaba a la GPU y las
    // estrellas quedaban congeladas en su opacidad inicial (invisibles).
    const u = materialRef.current?.uniforms;
    if (u) {
      u.uTime.value = state.clock.elapsedTime;
      u.uOpacity.value = skyState.starOpacity;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, CHARACTER_Z]}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
          <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
          <bufferAttribute attach="attributes-aBrightness" args={[brightnesses, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          transparent
          depthWrite={false}
          fog={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
