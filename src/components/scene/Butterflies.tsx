import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { ROAD_WIDTH } from '../../lib/constants';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { colors } from '../../lib/colors';

// Un puñado nada más — mismo patrón de pool independiente que Birds.tsx,
// pero con más tiempo "quietas" (ver createState) para que encontrarse con
// una se sienta ocasional, nunca constante.
const POOL_SIZE = 4;
const random = createSeededRandom(5591);

// Alas pastel variadas (nunca todas iguales) tomadas de colores ya
// existentes en la paleta — coherentes con tulipanes/lirios en vez de
// inventar un color nuevo.
const WING_COLORS = [colors.tulipPink, colors.tulipWhite, colors.petal, '#f6ecd2'];

type Phase = 'idle' | 'flying';

interface ButterflyState {
  phase: Phase;
  timer: number;
  progress: number;
  duration: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** Punto de control fuera de la línea recta start→end: es lo que hace
   * que el vuelo se sienta errático y curvo en vez de un lerp derecho. */
  control: THREE.Vector3;
  scale: number;
  wingColor: string;
  flapSpeed: number;
  wobbleSpeed: number;
  wobblePhase: number;
  dayGate: number;
}

function createState(): ButterflyState {
  return {
    phase: 'idle',
    // Arranques bien escalonados y con huecos largos: a diferencia de las
    // aves (que cruzan el cielo casi todo el tiempo), una mariposa debe
    // sentirse como un hallazgo, no una presencia constante.
    timer: randomBetween(random, 2, 20),
    progress: 0,
    duration: 7,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    control: new THREE.Vector3(),
    scale: 1,
    wingColor: WING_COLORS[0],
    flapSpeed: 14,
    wobbleSpeed: 2,
    wobblePhase: 0,
    dayGate: 1,
  };
}

function Butterfly({ state }: { state: ButterflyState }) {
  const groupRef = useRef<THREE.Group>(null);
  const wingLeftRef = useRef<THREE.Mesh>(null);
  const wingRightRef = useRef<THREE.Mesh>(null);
  const bodyMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: colors.ink }), []);
  const wingMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: state.wingColor, side: THREE.DoubleSide }), []);

  useFrame((frameState) => {
    const g = groupRef.current;
    if (!g) return;

    if (state.phase !== 'flying') {
      g.visible = false;
      return;
    }
    g.visible = true;
    // `state` es un objeto mutable, no estado de React: el color se elige
    // de nuevo en cada vuelo (ver el useFrame del pool en `Butterflies`),
    // así que hay que releerlo acá — un `useMemo` con `state.wingColor`
    // como dependencia nunca se volvería a evaluar (mutar `state` no
    // dispara un re-render).
    wingMaterial.color.set(state.wingColor);

    // Curva cuadrática (start → control → end) en vez de una línea recta:
    // el punto de control desviado es lo que da el vuelo errático pedido.
    const p = state.progress;
    const inv = 1 - p;
    g.position.set(
      inv * inv * state.start.x + 2 * inv * p * state.control.x + p * p * state.end.x,
      inv * inv * state.start.y + 2 * inv * p * state.control.y + p * p * state.end.y,
      inv * inv * state.start.z + 2 * inv * p * state.control.z + p * p * state.end.z,
    );

    // Aleteo suave adicional en altura, para que ni siquiera el tramo recto
    // entre dos instantes se sienta como una trayectoria mecánica.
    g.position.y += Math.sin(frameState.clock.elapsedTime * state.wobbleSpeed + state.wobblePhase) * 0.06;

    const lookAhead = Math.min(p + 0.05, 1);
    const invAhead = 1 - lookAhead;
    const aheadX =
      invAhead * invAhead * state.start.x + 2 * invAhead * lookAhead * state.control.x + lookAhead * lookAhead * state.end.x;
    const aheadZ =
      invAhead * invAhead * state.start.z + 2 * invAhead * lookAhead * state.control.z + lookAhead * lookAhead * state.end.z;
    g.lookAt(aheadX, g.position.y, aheadZ);

    g.scale.setScalar(state.scale * state.dayGate);

    const flap = Math.sin(frameState.clock.elapsedTime * state.flapSpeed) * 0.9 + 0.15;
    if (wingLeftRef.current) wingLeftRef.current.rotation.y = flap;
    if (wingRightRef.current) wingRightRef.current.rotation.y = -flap;
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.012, 0.09, 0.012]} />
        <primitive object={bodyMaterial} attach="material" />
      </mesh>
      <group position={[0.01, 0, 0]}>
        <mesh ref={wingLeftRef} position={[0.055, 0, 0]}>
          <circleGeometry args={[0.075, 8]} />
          <primitive object={wingMaterial} attach="material" />
        </mesh>
      </group>
      <group position={[-0.01, 0, 0]}>
        <mesh ref={wingRightRef} position={[-0.055, 0, 0]}>
          <circleGeometry args={[0.075, 8]} />
          <primitive object={wingMaterial} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Un puñado de mariposas (normalmente 0-2 a la vez) que revolotean cerca
 * del campo de girasoles durante el día — un detalle inesperado, nunca una
 * presencia constante. Ancladas a `CHARACTER_Z` (igual que Birds.tsx): el
 * personaje y la cámara están siempre fijos ahí, así que este es un
 * "escenario" que nunca se mueve con el scroll, pero al estar tan cerca
 * del personaje siempre queda dentro de lo que se ve.
 *
 * A diferencia de las aves (cruces rectos y altos, de horizonte a
 * horizonte), cada vuelo acá es corto, bajo y CURVO (ver el punto de
 * control en `Butterfly`), y pasa mucho más tiempo "quieta" entre vuelos.
 */
export function Butterflies() {
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
        state.timer = randomBetween(random, 4, 10);
        continue;
      }
      if (state.phase === 'idle') {
        state.timer -= delta;
        if (state.timer <= 0 && skyState.nightFactor < 0.3) {
          state.phase = 'flying';
          state.progress = 0;
          state.duration = randomBetween(random, 5, 9);
          state.wingColor = WING_COLORS[Math.floor(random() * WING_COLORS.length)];
          state.flapSpeed = randomBetween(random, 11, 17);
          state.wobbleSpeed = randomBetween(random, 1.4, 2.6);
          state.wobblePhase = random() * Math.PI * 2;
          state.scale = randomBetween(random, 0.8, 1.3);

          // Cerca del campo, a los dos lados del camino, bajo (a la altura
          // de las flores) y a una distancia moderada del personaje — nunca
          // tan lejos como para perderse, nunca sobre el camino mismo.
          const side = random() < 0.5 ? -1 : 1;
          const x0 = side * randomBetween(random, ROAD_WIDTH / 2 + 1, ROAD_WIDTH / 2 + 9);
          const z0 = CHARACTER_Z + randomBetween(random, -22, -4);
          const y0 = randomBetween(random, 0.45, 1.3);
          state.start.set(x0, y0, z0);

          const sideEnd = random() < 0.35 ? -side : side;
          state.end.set(
            sideEnd * randomBetween(random, ROAD_WIDTH / 2 + 1, ROAD_WIDTH / 2 + 9),
            randomBetween(random, 0.45, 1.3),
            z0 + randomBetween(random, -14, 14),
          );
          // Punto de control bien desviado del punto medio: da la curva.
          state.control.set(
            (x0 + state.end.x) / 2 + randomBetween(random, -4, 4) * side,
            Math.max(0.4, (y0 + state.end.y) / 2 + randomBetween(random, -0.3, 0.9)),
            (z0 + state.end.z) / 2 + randomBetween(random, -5, 5),
          );
        } else if (state.timer <= 0) {
          state.timer = randomBetween(random, 4, 10);
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
    <group ref={anchorRef}>
      {pool.map((state, i) => (
        <Butterfly key={i} state={state} />
      ))}
    </group>
  );
}
