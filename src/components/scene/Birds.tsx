import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { colors } from '../../lib/colors';

const POOL_SIZE = 3;
const random = createSeededRandom(2468);

type Phase = 'idle' | 'flying';

interface BirdState {
  phase: Phase;
  timer: number;
  progress: number;
  duration: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

function createState(): BirdState {
  return {
    phase: 'idle',
    timer: randomBetween(random, 3, 10),
    progress: 0,
    duration: 18,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
  };
}

function Bird({ state }: { state: BirdState }) {
  const groupRef = useRef<THREE.Group>(null);
  const wingLeftRef = useRef<THREE.Mesh>(null);
  const wingRightRef = useRef<THREE.Mesh>(null);

  useFrame((frameState) => {
    const g = groupRef.current;
    if (!g) return;

    if (state.phase !== 'flying') {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.lerpVectors(state.start, state.end, state.progress);
    g.lookAt(state.end.x, g.position.y, state.end.z);

    const flap = Math.sin(frameState.clock.elapsedTime * 9) * 0.6;
    if (wingLeftRef.current) wingLeftRef.current.rotation.z = flap;
    if (wingRightRef.current) wingRightRef.current.rotation.z = -flap;
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={wingLeftRef} position={[0.12, 0, 0]}>
        <planeGeometry args={[0.5, 0.14]} />
        <meshBasicMaterial color={colors.pugDark} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={wingRightRef} position={[-0.12, 0, 0]}>
        <planeGeometry args={[0.5, 0.14]} />
        <meshBasicMaterial color={colors.pugDark} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * Un puñado de aves que ocasionalmente cruzan el cielo durante el día.
 * Nunca son muchas a la vez y no vuelan de noche.
 */
export function Birds() {
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;
  const anchorRef = useRef<THREE.Group>(null);
  const pool = useMemo(() => Array.from({ length: POOL_SIZE }, createState), []);

  useFrame((_, delta) => {
    const distance = scrollState.current.smoothDistance;
    getSkyState(getCycleProgress(distance), skyState);

    for (const state of pool) {
      if (state.phase === 'idle') {
        state.timer -= delta;
        if (state.timer <= 0 && skyState.nightFactor < 0.3) {
          state.phase = 'flying';
          state.progress = 0;
          state.duration = randomBetween(random, 14, 24);
          const height = randomBetween(random, 12, 20);
          const depth = randomBetween(random, -35, -5);
          const fromLeft = random() < 0.5;
          const x0 = fromLeft ? -60 : 60;
          const x1 = fromLeft ? 60 : -60;
          state.start.set(x0, height, depth);
          state.end.set(x1, height + randomBetween(random, -2, 3), depth - randomBetween(random, 5, 15));
        } else if (state.timer <= 0) {
          state.timer = randomBetween(random, 3, 8);
        }
      } else {
        state.progress += delta / state.duration;
        if (state.progress >= 1) {
          state.phase = 'idle';
          state.timer = randomBetween(random, 6, 16);
        }
      }
    }
  });

  return (
    <group ref={anchorRef} position={[0, 0, CHARACTER_Z]}>
      {pool.map((state, i) => (
        <Bird key={i} state={state} />
      ))}
    </group>
  );
}
