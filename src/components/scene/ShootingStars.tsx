import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { CYCLE_LENGTH } from '../../lib/constants';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

// Suficiente para que un "racimo" entero (hasta 3) pueda estar en vuelo al
// mismo tiempo, ver `activateBurst`.
const POOL_SIZE = 3;
const random = createSeededRandom(1313);

// Meseta nocturna real (ver KEYFRAMES en dayNightCycle.ts, filas t=0.44 y
// t=0.80, ambas con night=1): las estrellas fugaces solo se programan
// dentro de este tramo del ciclo, así que "una noche" tiene un principio y
// un final claros para repartirlas.
const NIGHT_START = 0.44;
const NIGHT_END = 0.8;
const STARS_PER_NIGHT = 3;

type Phase = 'idle' | 'active';

interface ShootingStarState {
  phase: Phase;
  progress: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  duration: number;
  // Variación por evento: cada estrella fugaz tiene su propio tamaño,
  // brillo y largo de cola, en vez de un único aspecto fijo repetido.
  headSize: number;
  streakThickness: number;
  streakLength: number;
  headPeakOpacity: number;
  streakPeakOpacity: number;
}

function createState(): ShootingStarState {
  return {
    phase: 'idle',
    progress: 0,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    duration: 3,
    headSize: 0.16,
    streakThickness: 0.16,
    streakLength: 7,
    headPeakOpacity: 0.75,
    streakPeakOpacity: 0.45,
  };
}

/** Reparte `STARS_PER_NIGHT` puntos de disparo (en progreso de ciclo) a lo
 * largo de la meseta nocturna de UNA noche concreta (`nightIndex`), cada
 * uno en su propio tramo para que nunca queden pegados entre sí. Un seed
 * distinto por noche (derivado de `nightIndex`) hace que la posición exacta
 * varíe de una noche a otra sin dejar de ser determinística. */
function scheduleNightTriggers(nightIndex: number): number[] {
  const rng = createSeededRandom(7717 + nightIndex * 104729);
  const span = (NIGHT_END - NIGHT_START) / STARS_PER_NIGHT;
  const triggers: number[] = [];
  for (let i = 0; i < STARS_PER_NIGHT; i++) {
    const segStart = NIGHT_START + i * span;
    triggers.push(randomBetween(rng, segStart + span * 0.12, segStart + span * 0.88));
  }
  return triggers;
}

/** Sortea la apariencia y el trayecto de una nueva estrella fugaz y deja el
 * estado listo para empezar a animarse desde progress = 0. */
function activate(state: ShootingStarState) {
  state.phase = 'active';
  state.progress = 0;
  state.duration = randomBetween(random, 2.5, 4);
  // Altura moderada: en la parte alta del cielo, por encima de la persona
  // y el Pug, pero con margen de sobra dentro del encuadre real de la
  // cámara (que mira casi al frente, no hacia arriba, y cuya altura/
  // inclinación varían levemente entre día y noche).
  const height = randomBetween(random, 9, 18);
  // Recorrido corto pero con posición inicial bien variada: el trayecto
  // completo debe caber dentro del campo visual de la cámara para que se
  // vea de principio a fin, pero el punto de partida se mueve lo bastante
  // para que dos cometas del mismo racimo (simultáneos) se vean en
  // posiciones claramente distintas, no trazando casi la misma línea.
  const spanX = randomBetween(random, -9, 9);
  const travel = randomBetween(random, 24, 34);
  const descent = randomBetween(random, 1.5, 3.5);
  // Siempre bien adelante del personaje/cámara, nunca cerca, y sin bajar
  // lo suficiente como para acercarse al horizonte.
  const depth = CHARACTER_Z - randomBetween(random, 42, 58);
  // Derecha -> izquierda: X decrece de start a end.
  state.start.set(spanX + travel / 2, height, depth);
  state.end.set(spanX - travel / 2, height - descent, depth);

  state.headSize = randomBetween(random, 0.13, 0.24);
  state.streakThickness = randomBetween(random, 0.12, 0.22);
  state.streakLength = randomBetween(random, 5, 9);
  state.headPeakOpacity = randomBetween(random, 0.55, 0.9);
  state.streakPeakOpacity = state.headPeakOpacity * randomBetween(random, 0.5, 0.7);
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
    streakCenter.copy(headPos).addScaledVector(direction, -state.streakLength * 0.5);

    head.visible = true;
    streak.visible = true;
    head.position.copy(headPos);
    head.scale.setScalar(state.headSize / 0.2);
    streak.position.copy(streakCenter);
    quaternion.setFromUnitVectors(xAxis, direction);
    streak.quaternion.copy(quaternion);
    streak.scale.set(state.streakLength, state.streakThickness, 1);

    // Entra y sale suavemente (nunca un destello instantáneo), con más
    // tiempo de permanencia a brillo pleno en medio del recorrido.
    const fadeIn = Math.min(state.progress / 0.18, 1);
    const fadeOut = 1 - Math.max((state.progress - 0.7) / 0.3, 0);
    const envelope = Math.min(fadeIn, fadeOut);
    if (headMaterialRef.current) headMaterialRef.current.opacity = envelope * state.headPeakOpacity;
    if (streakMaterialRef.current) streakMaterialRef.current.opacity = envelope * state.streakPeakOpacity;
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
        <meshBasicMaterial
          ref={headMaterialRef}
          color="#ffffff"
          transparent
          depthWrite={false}
          fog={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

/** Cuántos cometas nacen por racimo (la mayoría 2, a veces 3) — nunca en el
 * mismo instante exacto, ver el `delay` escalonado en el disparo. */
function rollBurstSize(): number {
  return random() < 0.4 ? 3 : 2;
}

/**
 * Estrellas fugaces: `STARS_PER_NIGHT` (3) racimos por cada ciclo nocturno,
 * repartidos en tramos separados de la meseta de noche (ver
 * `scheduleNightTriggers`) para que la noche no se sienta una lluvia de
 * meteoros constante, pero tampoco dependan de la suerte de un temporizador
 * en tiempo real — el reparto está atado al AVANCE del ciclo (cuánto se ha
 * scrolleado), no a cuánto tiempo real pasa mirando la pantalla. Cada
 * racimo lanza 2-3 cometas con un pequeño escalonamiento (nunca el mismo
 * instante) para que se crucen el cielo simultáneamente pero sin sentirse
 * sincronizados — cada uno con su propia posición, tamaño, velocidad y
 * trayectoria (ver `activate`). Cruzan de derecha a izquierda, despacio
 * (2.5-4s de principio a fin), en una franja siempre bien por delante del
 * personaje/cámara (nunca cerca de esta), por encima de donde caminan la
 * persona y el Pug, y sin llegar a tocar el horizonte. `POOL_SIZE = 3`
 * combinado con una cola de lanzamientos pendientes asegura que ningún
 * cometa se pierda aunque el racimo entero no quepa de una.
 */
export function ShootingStars() {
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;
  const texture = useMemo(() => createStreakTexture(), []);

  const pool = useMemo(() => Array.from({ length: POOL_SIZE }, createState), []);

  const scheduleRef = useRef<{ nightIndex: number; triggers: number[]; fired: boolean[] }>({
    nightIndex: NaN,
    triggers: [],
    fired: [],
  });
  const pendingRef = useRef<number[]>([]);

  useFrame((_, delta) => {
    const distance = scrollState.current.smoothDistance;
    const cycleProgress = getCycleProgress(distance);
    getSkyState(cycleProgress, skyState);

    const nightIndex = Math.floor(distance / CYCLE_LENGTH);
    const schedule = scheduleRef.current;
    if (schedule.nightIndex !== nightIndex) {
      schedule.nightIndex = nightIndex;
      schedule.triggers = scheduleNightTriggers(nightIndex);
      schedule.fired = schedule.triggers.map(() => false);
      pendingRef.current = [];
    }

    for (let i = 0; i < schedule.triggers.length; i++) {
      if (!schedule.fired[i] && cycleProgress >= schedule.triggers[i] && skyState.nightFactor > 0.55) {
        schedule.fired[i] = true;
        // Programa un racimo de 2-3 lanzamientos escalonados (delays
        // crecientes en segundos reales) en vez de uno solo.
        const burstSize = rollBurstSize();
        let cumulativeDelay = 0;
        for (let k = 0; k < burstSize; k++) {
          pendingRef.current.push(cumulativeDelay);
          cumulativeDelay += randomBetween(random, 0.5, 1.6);
        }
      }
    }

    // Cuenta regresiva de los lanzamientos pendientes; cuando a uno le
    // toca, lo activa en cualquier slot libre de la reserva. Si todavía no
    // hay ninguno libre (racimo de 3 con la reserva ocupada), simplemente
    // sigue esperando el próximo frame en vez de perderse.
    if (pendingRef.current.length > 0) {
      pendingRef.current = pendingRef.current.map((d) => d - delta);
      pendingRef.current = pendingRef.current.filter((d) => {
        if (d > 0) return true;
        const idleState = pool.find((s) => s.phase === 'idle');
        if (!idleState) return true;
        activate(idleState);
        return false;
      });
    }

    for (const state of pool) {
      if (state.phase === 'active') {
        state.progress += delta / state.duration;
        if (state.progress >= 1) {
          state.phase = 'idle';
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
