import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

const POOL_SIZE = 2;
const TRAIL_LENGTH = 6;
const random = createSeededRandom(1313);

type Phase = 'idle' | 'active';

interface ShootingStarState {
  phase: Phase;
  timer: number;
  progress: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  duration: number;
}

function createState(): ShootingStarState {
  return {
    phase: 'idle',
    timer: randomBetween(random, 6, 16),
    progress: 0,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    duration: 1.2,
  };
}

function createStreakTexture() {
  const w = 128;
  const h = 16;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Una estrella fugaz dibujada a mano (sin `Trail` de drei): una franja con
 * degradado que apunta en la dirección del movimiento, más un pequeño
 * brillo en la punta. Controlar la visibilidad de un solo mesh (en vez de
 * un sistema de trail que sigue recordando posiciones pasadas) evita que
 * quede un resto visible cuando el evento termina.
 */
function ShootingStar({ state, texture }: { state: ShootingStarState; texture: THREE.Texture }) {
  const headRef = useRef<THREE.Mesh>(null);
  const streakRef = useRef<THREE.Mesh>(null);
  const headMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const streakMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  const direction = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const headPos = useMemo(() => new THREE.Vector3(), []);
  const streakCenter = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const xAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  useFrame(() => {
    const head = headRef.current;
    const streak = streakRef.current;
    if (!head || !streak) return;

    if (state.phase !== 'active') {
      head.visible = false;
      streak.visible = false;
      return;
    }

    direction.subVectors(state.end, state.start).normalize();
    headPos.lerpVectors(state.start, state.end, state.progress);
    streakCenter.copy(headPos).addScaledVector(direction, -TRAIL_LENGTH * 0.5);

    head.visible = true;
    streak.visible = true;
    head.position.copy(headPos);
    streak.position.copy(streakCenter);
    quaternion.setFromUnitVectors(xAxis, direction);
    streak.quaternion.copy(quaternion);
    streak.scale.set(TRAIL_LENGTH, 0.22, 1);

    const fadeIn = Math.min(state.progress / 0.12, 1);
    const fadeOut = 1 - Math.max((state.progress - 0.65) / 0.35, 0);
    const opacity = Math.min(fadeIn, fadeOut);
    if (headMaterialRef.current) headMaterialRef.current.opacity = opacity;
    if (streakMaterialRef.current) streakMaterialRef.current.opacity = opacity * 0.9;
  });

  return (
    <>
      <mesh ref={streakRef} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={streakMaterialRef}
          map={texture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          fog={false}
        />
      </mesh>
      <mesh ref={headRef} visible={false}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshBasicMaterial ref={headMaterialRef} color="#ffffff" transparent depthWrite={false} fog={false} />
      </mesh>
    </>
  );
}

/**
 * Estrellas fugaces ocasionales: solo pueden dispararse durante la noche
 * (nightFactor alto), en intervalos aleatorios largos, para que sean un
 * pequeño evento especial y no una constante.
 */
export function ShootingStars() {
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;
  const texture = useMemo(() => createStreakTexture(), []);

  const pool = useMemo(() => Array.from({ length: POOL_SIZE }, createState), []);

  useFrame((_, delta) => {
    const distance = scrollState.current.smoothDistance;
    getSkyState(getCycleProgress(distance), skyState);

    for (const state of pool) {
      if (state.phase === 'idle') {
        state.timer -= delta;
        if (state.timer <= 0 && skyState.nightFactor > 0.55) {
          state.phase = 'active';
          state.progress = 0;
          state.duration = randomBetween(random, 0.9, 1.4);
          const height = randomBetween(random, 28, 55);
          const spanX = randomBetween(random, -50, 50);
          const depth = randomBetween(random, -40, 10);
          state.start.set(spanX - 35, height, CHARACTER_Z + depth);
          state.end.set(spanX + 35, height - randomBetween(random, 14, 22), CHARACTER_Z + depth - 10);
        } else if (state.timer <= 0) {
          // No es de noche todavía: reintenta más tarde.
          state.timer = randomBetween(random, 2, 5);
        }
      } else {
        state.progress += delta / state.duration;
        if (state.progress >= 1) {
          state.phase = 'idle';
          state.timer = randomBetween(random, 8, 20);
        }
      }
    }
  });

  return (
    <>
      {pool.map((state, i) => (
        <ShootingStar key={i} state={state} texture={texture} />
      ))}
    </>
  );
}
