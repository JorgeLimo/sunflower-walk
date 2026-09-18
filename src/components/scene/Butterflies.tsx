import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { ROAD_WIDTH } from '../../lib/constants';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { colors } from '../../lib/colors';

// Subido de 4 a 6 y con huecos más cortos entre vuelos (ver createState):
// a pedido explícito de que sean "visibles durante el recorrido" en vez de
// un hallazgo rarísimo — pero sigue siendo un puñado, nunca una nube, para
// que continúen leyéndose como un detalle secundario frente a girasoles/
// tulipanes/lirios.
const POOL_SIZE = 6;
const random = createSeededRandom(5591);

// Alas pastel variadas (nunca todas iguales) tomadas de colores ya
// existentes en la paleta — coherentes con tulipanes/lirios/personitas en
// vez de inventar un color nuevo. `greeterOutfits[4]` (lavanda suave) suma
// una quinta variante sin salirse de la paleta ya establecida.
const WING_COLORS = [colors.tulipPink, colors.tulipWhite, colors.petal, '#f6ecd2', colors.greeterOutfits[4]];

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
  /** Segundo par de fases/velocidades, independientes de las de arriba,
   * para un vaivén lateral (X/Z) además del vertical — pequeños cambios de
   * dirección dentro del mismo vuelo, no solo un arco liso. */
  wobbleSpeed2: number;
  wobblePhase2: number;
  dayGate: number;
  /** Identidad fija de ESTA mariposa (no cambia entre vuelos, a diferencia
   * de color/velocidad/tamaño): cuánto mide el ala y cuánto se curva —
   * ligera variación de apariencia entre individuos, ver `buildWingGeometry`. */
  wingSize: number;
  wingCup: number;
  wingShade: number;
}

function createState(): ButterflyState {
  return {
    phase: 'idle',
    // Arranques bien escalonados pero con huecos más cortos que antes: a
    // diferencia de las aves (que cruzan el cielo casi todo el tiempo), una
    // mariposa debe seguir sintiéndose un hallazgo — solo que ahora un
    // hallazgo frecuente, no rarísimo.
    timer: randomBetween(random, 1.5, 13),
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
    wobbleSpeed2: 1.6,
    wobblePhase2: 0,
    dayGate: 1,
    wingSize: randomBetween(random, 0.115, 0.145),
    wingCup: randomBetween(random, 0.018, 0.034),
    wingShade: randomBetween(random, 0.62, 0.82),
  };
}

/** Silueta de UN ala (mitad derecha; la izquierda reusa la misma geometría
 * espejada vía `scale.x = -1`), en espacio "unitario": el borde de pliegue
 * (donde se une al cuerpo) queda en x=0, la punta hacia x=1. Dos lóbulos —
 * uno grande arriba (ala anterior) y uno más chico abajo (ala posterior),
 * con una cintura entre ambos — en vez del círculo liso anterior, para que
 * de cerca se reconozca de inmediato como una mariposa y no una figura
 * geométrica flotando. */
function buildWingShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.1);
  shape.bezierCurveTo(0.34, 0.62, 0.86, 0.52, 1.0, 0.22);
  shape.bezierCurveTo(0.9, 0.02, 0.62, -0.02, 0.46, -0.04);
  shape.bezierCurveTo(0.64, -0.22, 0.58, -0.56, 0.26, -0.52);
  shape.bezierCurveTo(0.06, -0.5, -0.02, -0.2, 0, 0.1);
  shape.closePath();
  return shape;
}

/** Ala con volumen (una leve "cupulación" hacia atrás desde el pliegue
 * hacia la punta, mismo truco que la curvatura de los pétalos de girasol)
 * y un degradado de tono sutil vía color de vértice — sin esto, la
 * curvatura sería invisible bajo una `MeshBasicMaterial` sin luz, así que
 * el ala pasa a usar un material que sí reacciona a la luz de la escena. */
function buildWingGeometry(size: number, cupDepth: number, edgeShade: number): THREE.BufferGeometry {
  const geo = new THREE.ShapeGeometry(buildWingShape(), 10);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colorArr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getX(i), 0, 1);
    pos.setZ(i, -Math.sin(t * Math.PI * 0.5) * cupDepth);
    const shade = THREE.MathUtils.lerp(1, edgeShade, t);
    colorArr[i * 3] = shade;
    colorArr[i * 3 + 1] = shade;
    colorArr[i * 3 + 2] = shade;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
  geo.scale(size, size, size);
  geo.computeVertexNormals();
  return geo;
}

const eyespotGeometry = new THREE.CircleGeometry(0.012, 8);
const bodyGeometry = new THREE.CapsuleGeometry(0.008, 0.05, 4, 8);
const headGeometry = new THREE.SphereGeometry(0.013, 8, 6);
const antennaGeometry = new THREE.CylinderGeometry(0.0012, 0.0025, 0.05, 4);

function Butterfly({ state }: { state: ButterflyState }) {
  const groupRef = useRef<THREE.Group>(null);
  const wingLeftRef = useRef<THREE.Mesh>(null);
  const wingRightRef = useRef<THREE.Mesh>(null);
  const bodyMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: colors.ink }), []);
  const eyespotMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: colors.ink, transparent: true, opacity: 0.55 }), []);
  const wingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: state.wingColor,
        // Un poco de emissive del mismo tono (no solo `color`): con luz
        // direccional real, el lado en sombra de una `MeshStandardMaterial`
        // pierde casi todo el color y se ve gris — nunca pasaba con la
        // `MeshBasicMaterial` (sin luz) de antes. Este aporte constante
        // mantiene el tono pastel visible en cualquier ángulo, mientras el
        // lado iluminado sigue ganando el brillo/degradado que vende el
        // volumen del ala.
        emissive: state.wingColor,
        emissiveIntensity: 0.4,
        vertexColors: true,
        roughness: 0.55,
        side: THREE.DoubleSide,
      }),
    [],
  );
  // Fija para toda la vida de esta mariposa (ver `wingSize`/`wingCup` en
  // `ButterflyState`) — no se reconstruye en cada vuelo, a diferencia del
  // color/velocidad, que sí varían de un vuelo a otro.
  const wingGeometry = useMemo(
    () => buildWingGeometry(state.wingSize, state.wingCup, state.wingShade),
    [state.wingSize, state.wingCup, state.wingShade],
  );
  // Punta del lóbulo superior (ala anterior) en espacio ya escalado: mismo
  // cálculo que `buildWingGeometry` usa para el hundido en Z, para que la
  // manchita quede apoyada sobre la superficie curva y no flotando encima.
  const eyespot = useMemo(() => {
    const t = 0.62;
    const z = -Math.sin(t * Math.PI * 0.5) * state.wingCup * state.wingSize + 0.003;
    return [t * state.wingSize, 0.14 * state.wingSize, z] as [number, number, number];
  }, [state.wingSize, state.wingCup]);

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
    wingMaterial.emissive.set(state.wingColor);

    // Curva cuadrática (start → control → end) en vez de una línea recta:
    // el punto de control desviado es lo que da el vuelo errático pedido.
    const p = state.progress;
    const inv = 1 - p;
    const t = frameState.clock.elapsedTime;
    g.position.set(
      inv * inv * state.start.x + 2 * inv * p * state.control.x + p * p * state.end.x,
      inv * inv * state.start.y + 2 * inv * p * state.control.y + p * p * state.end.y,
      inv * inv * state.start.z + 2 * inv * p * state.control.z + p * p * state.end.z,
    );

    // Aleteo suave adicional en altura, más un vaivén lateral independiente
    // (X/Z, otra frecuencia/fase) — ni siquiera el tramo recto entre dos
    // instantes se siente como una trayectoria mecánica, y ahora el cambio
    // de rumbo también se nota de costado, no solo subiendo/bajando.
    g.position.y += Math.sin(t * state.wobbleSpeed + state.wobblePhase) * 0.06;
    g.position.x += Math.sin(t * state.wobbleSpeed2 + state.wobblePhase2) * 0.05;
    g.position.z += Math.cos(t * state.wobbleSpeed2 * 0.8 + state.wobblePhase2) * 0.05;

    const lookAhead = Math.min(p + 0.05, 1);
    const invAhead = 1 - lookAhead;
    const aheadX =
      invAhead * invAhead * state.start.x + 2 * invAhead * lookAhead * state.control.x + lookAhead * lookAhead * state.end.x;
    const aheadZ =
      invAhead * invAhead * state.start.z + 2 * invAhead * lookAhead * state.control.z + lookAhead * lookAhead * state.end.z;
    g.lookAt(aheadX, g.position.y, aheadZ);

    g.scale.setScalar(state.scale * state.dayGate);

    const flap = Math.sin(t * state.flapSpeed) * 0.9 + 0.15;
    if (wingLeftRef.current) wingLeftRef.current.rotation.y = flap;
    if (wingRightRef.current) wingRightRef.current.rotation.y = -flap;
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={bodyGeometry} material={bodyMaterial} />
      <group position={[0, 0.04, 0]}>
        <mesh geometry={headGeometry} material={bodyMaterial} />
        <mesh geometry={antennaGeometry} material={bodyMaterial} position={[0.006, 0.024, 0]} rotation={[0, 0, -0.35]} />
        <mesh geometry={antennaGeometry} material={bodyMaterial} position={[-0.006, 0.024, 0]} rotation={[0, 0, 0.35]} />
      </group>
      <mesh ref={wingRightRef} geometry={wingGeometry} material={wingMaterial} position={[0.008, 0, 0]} rotation={[-0.1, 0, 0]}>
        <mesh geometry={eyespotGeometry} material={eyespotMaterial} position={eyespot} />
      </mesh>
      <mesh
        ref={wingLeftRef}
        geometry={wingGeometry}
        material={wingMaterial}
        position={[-0.008, 0, 0]}
        scale={[-1, 1, 1]}
        rotation={[-0.1, 0, 0]}
      >
        <mesh geometry={eyespotGeometry} material={eyespotMaterial} position={eyespot} />
      </mesh>
    </group>
  );
}

/**
 * Un puñado de mariposas (normalmente 0-2 a la vez) que revolotean cerca
 * del campo de girasoles durante el día — un detalle inesperado, sigue sin
 * ser una presencia constante, pero ahora más frecuente que antes (ver
 * `POOL_SIZE`/`timer`). Ancladas a `CHARACTER_Z` (igual que Birds.tsx): el
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
        state.timer = randomBetween(random, 3, 8);
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
          state.wobbleSpeed2 = randomBetween(random, 1.0, 2.0);
          state.wobblePhase2 = random() * Math.PI * 2;
          state.scale = randomBetween(random, 0.8, 1.3);

          // Cerca del campo, a los dos lados del camino, bajo (a la altura
          // de las flores) y a una distancia moderada del personaje — un
          // poco más cerca del borde que antes, para que algunas rocen el
          // camino en vez de quedar siempre encerradas en las flores.
          const side = random() < 0.5 ? -1 : 1;
          const x0 = side * randomBetween(random, ROAD_WIDTH / 2 + 0.6, ROAD_WIDTH / 2 + 9);
          const z0 = CHARACTER_Z + randomBetween(random, -22, -4);
          const y0 = randomBetween(random, 0.4, 1.4);
          state.start.set(x0, y0, z0);

          // ~35% de los vuelos son "ida y vuelta": el destino queda cerca
          // del punto de partida, así que el arco (que sí se aleja bastante
          // gracias al punto de control) se siente como que se aleja y
          // vuelve, en vez de cruzar siempre hacia otro lugar distinto.
          if (random() < 0.35) {
            state.end.set(
              x0 + randomBetween(random, -1.4, 1.4),
              THREE.MathUtils.clamp(y0 + randomBetween(random, -0.3, 0.3), 0.35, 1.5),
              z0 + randomBetween(random, -1.6, 1.6),
            );
          } else {
            const sideEnd = random() < 0.35 ? -side : side;
            state.end.set(
              sideEnd * randomBetween(random, ROAD_WIDTH / 2 + 0.6, ROAD_WIDTH / 2 + 9),
              randomBetween(random, 0.4, 1.4),
              z0 + randomBetween(random, -14, 14),
            );
          }
          // Punto de control bien desviado del punto medio: da la curva.
          state.control.set(
            (x0 + state.end.x) / 2 + randomBetween(random, -4, 4) * side,
            Math.max(0.35, (y0 + state.end.y) / 2 + randomBetween(random, -0.3, 0.9)),
            (z0 + state.end.z) / 2 + randomBetween(random, -5, 5),
          );
        } else if (state.timer <= 0) {
          state.timer = randomBetween(random, 3, 8);
        }
      } else {
        state.progress += delta / state.duration;
        if (state.progress >= 1) {
          state.phase = 'idle';
          state.timer = randomBetween(random, 4, 12);
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
