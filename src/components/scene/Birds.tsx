import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { colors } from '../../lib/colors';

// Más aves en la reserva y huecos cortos entre vuelos: con 5 pájaros
// independientes volando ~80% del tiempo cada uno, lo normal es ver 3-5 a
// la vez, nunca sincronizados (cada uno tiene su propio temporizador).
const POOL_SIZE = 5;
const random = createSeededRandom(2468);

type Phase = 'idle' | 'flying';

interface BirdState {
  phase: Phase;
  timer: number;
  progress: number;
  duration: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  scale: number;
  /** Cuán "de día" es AHORA, reevaluado cada frame. El vuelo dura 14-26
   * segundos REALES mientras el ciclo avanza con el scroll: yendo rápido,
   * un ave lanzada de día seguía cruzando un cielo ya nocturno. */
  dayGate: number;
}

function createState(): BirdState {
  return {
    phase: 'idle',
    // Arranques escalonados (hasta 14s) para que la reserva no "despierte"
    // toda junta al empezar el día.
    timer: randomBetween(random, 1, 14),
    progress: 0,
    duration: 18,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    scale: 1,
    dayGate: 1,
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
    // Se encoge hasta desaparecer si la noche la alcanza en pleno vuelo.
    g.scale.setScalar(state.scale * state.dayGate);

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
 * Un grupo de aves (normalmente 3-5 a la vez) que cruzan el cielo durante
 * el día, cada una con su propia altura, profundidad, tamaño, velocidad y
 * trayectoria — nunca vuelan de noche ni se mueven en sincronía, porque
 * cada una tiene su propio temporizador independiente.
 */
export function Birds() {
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;
  const anchorRef = useRef<THREE.Group>(null);
  const pool = useMemo(() => Array.from({ length: POOL_SIZE }, createState), []);

  useFrame((_, delta) => {
    const distance = scrollState.current.smoothDistance;
    getSkyState(getCycleProgress(distance), skyState);

    const dayGate = 1 - THREE.MathUtils.smoothstep(skyState.nightFactor, 0.3, 0.55);
    for (const state of pool) {
      state.dayGate = dayGate;
      if (state.phase === 'flying' && dayGate <= 0) {
        state.phase = 'idle';
        state.timer = randomBetween(random, 3, 8);
        continue;
      }
      if (state.phase === 'idle') {
        state.timer -= delta;
        if (state.timer <= 0 && skyState.nightFactor < 0.3) {
          state.phase = 'flying';
          state.progress = 0;
          state.duration = randomBetween(random, 14, 26);
          // Profundidad y altura variadas para que no todas se vean del
          // mismo tamaño ni a la misma distancia — pero la altura se deriva
          // de la profundidad (no un rango independiente): un ave cercana
          // puesta demasiado alta queda fuera del campo visual real de la
          // cámara, igual que le pasaba antes al sol/la luna/las nubes.
          const depth = randomBetween(random, -95, -35);
          const height = 2.2 + (Math.abs(depth) + 6.4) * 0.28 + randomBetween(random, -3, 3);
          state.scale = randomBetween(random, 0.65, 1.35);
          const fromLeft = random() < 0.5;
          const x0 = fromLeft ? -60 : 60;
          const x1 = fromLeft ? 60 : -60;
          state.start.set(x0, height, depth);
          state.end.set(x1, height + randomBetween(random, -4, 5), depth - randomBetween(random, 5, 20));
        } else if (state.timer <= 0) {
          state.timer = randomBetween(random, 3, 8);
        }
      } else {
        state.progress += delta / state.duration;
        if (state.progress >= 1) {
          state.phase = 'idle';
          // Huecos cortos entre vuelos: con varias aves independientes esto
          // basta para que casi siempre haya 3-5 en el aire a la vez, sin
          // que ninguna quede volando de forma permanente.
          state.timer = randomBetween(random, 2, 6);
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
