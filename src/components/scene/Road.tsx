import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { ROAD_WIDTH, TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

interface LightPost {
  x: number;
  z: number;
}

// Más faroles y más juntos que antes (antes 2 por lado cada TILE_LENGTH,
// es decir uno cada 16 unidades) para que el recorrido se sienta iluminado
// de forma continua, sin tramos largos a oscuras entre uno y otro — pero
// sin llegar a verse pegados entre sí.
const LIGHTS_PER_SIDE = 4;

/**
 * Reparto de faroles para UN slot del camino: intervalos regulares (uno
 * cada ~TILE_LENGTH/LIGHTS_PER_SIDE) con un pequeño jitter para que no se
 * vean perfectamente robóticos. Sembrado por número de SLOT (no de índice
 * de tile) para que la posición no tenga que recalcularse cuando un slot
 * se recicla — el patrón se repite cada TOTAL_TILES segmentos, que es un
 * tramo lo bastante largo como para que nadie lo note caminando.
 */
function generateSlotLights(slot: number): LightPost[] {
  const random = createSeededRandom(slot * 733 + 41);
  const posts: LightPost[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < LIGHTS_PER_SIDE; i++) {
      const baseZ = -TILE_LENGTH / 2 + (TILE_LENGTH * (i + 0.5)) / LIGHTS_PER_SIDE;
      const z = baseZ + randomBetween(random, -1.4, 1.4);
      // Separados del camino a propósito (nunca pegados al borde).
      const x = side * (ROAD_WIDTH / 2 + randomBetween(random, 0.35, 0.75));
      posts.push({ x, z });
    }
  }
  return posts;
}

const SLOT_LIGHTS: LightPost[][] = Array.from({ length: TOTAL_TILES }, (_, slot) => generateSlotLights(slot));

// Cuántos faroles reales (con `pointLight` de verdad, no solo emisivo) hay
// activos a la vez por lado. Se reasignan dinámicamente al farol físico más
// cercano al personaje en cada frame (ver más abajo) en vez de vivir en un
// desplazamiento fijo respecto a CHARACTER_Z — así la luz "de verdad" viaja
// de farol en farol a medida que se avanza, en vez de sentirse flotando en
// un punto fijo del aire mientras el camino se desliza debajo.
const NEAR_LIGHTS_PER_SIDE = 3;

/**
 * El camino se construye con un número fijo de segmentos ("tiles") que se
 * reciclan a medida que el personaje avanza: el segmento que queda muy
 * atrás salta hacia adelante en vez de crear geometría nueva. Da la
 * sensación de un camino infinito con memoria constante.
 *
 * Los faroles a los costados reutilizan ESTE mismo sistema de tiles (cada
 * uno vive dentro del grupo de su propio segmento, así que se mueve gratis
 * junto con él) en vez de un sistema de posicionamiento aparte. Son
 * exclusivamente decorativos de noche: todos comparten UN solo material
 * emisivo (sin luz real) cuya intensidad sigue el `nightFactor` del ciclo
 * día/noche existente, y solo un puñado de faroles cercanos al personaje
 * llevan además una `pointLight` real — así el camino se ve iluminado de
 * punta a punta sin necesitar decenas de luces reales.
 */
export function Road() {
  const scrollState = useScrollState();
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const skyState = useRef(createSkyState()).current;

  const lightGeometry = useMemo(() => new THREE.SphereGeometry(0.07, 6, 6), []);
  const lightMaterial = useMemo(
    () =>
      // El color BASE es un bronce apagado (se confunde con el borde del
      // camino/el césped) a propósito: de día, con `emissiveIntensity=0`,
      // debe verse como una piedrita discreta, no como un punto naranja
      // brillante. El calor cálido llega únicamente vía `emissive`, que
      // solo se enciende de noche.
      new THREE.MeshStandardMaterial({
        color: '#7a6650',
        emissive: colors.sunGlow,
        emissiveIntensity: 0,
        roughness: 0.7,
      }),
    [],
  );

  const nearLightRefs = useRef<(THREE.PointLight | null)[]>([]);
  // Scratch reutilizado cuadro a cuadro (sin asignar arrays/objetos nuevos
  // en el loop de useFrame): para cada lado, las N distancias/posiciones de
  // los faroles físicos más cercanos al personaje encontrados este frame.
  const nearBestDist = useRef([
    new Array(NEAR_LIGHTS_PER_SIDE).fill(Infinity),
    new Array(NEAR_LIGHTS_PER_SIDE).fill(Infinity),
  ]).current;
  const nearBestX = useRef([new Array(NEAR_LIGHTS_PER_SIDE).fill(0), new Array(NEAR_LIGHTS_PER_SIDE).fill(0)]).current;
  const nearBestZ = useRef([new Array(NEAR_LIGHTS_PER_SIDE).fill(0), new Array(NEAR_LIGHTS_PER_SIDE).fill(0)]).current;

  const fillGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ROAD_WIDTH, TILE_LENGTH, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const edgeGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.35, TILE_LENGTH, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  useFrame(() => {
    const distance = scrollState.current.smoothDistance;
    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    recycleTileIndices(indices, targetMinIndex);

    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      const group = groupRefs.current[slot];
      if (group) group.position.z = tileRenderZ(indices[slot], distance);
    }

    getSkyState(getCycleProgress(distance), skyState);
    // Apagados de día, se encienden progresivamente en el atardecer y
    // llegan a su máximo de noche — un solo material compartido por todos
    // los faroles "lejanos", así que un único write por frame los mueve a
    // todos a la vez.
    lightMaterial.emissiveIntensity = skyState.nightFactor * 1.6;

    // Encontrar, a cada lado, los N faroles físicos (de CUALQUIER slot, ya
    // reposicionado este mismo frame) más cercanos al personaje. Inserción
    // manual en un top-N chico: nada de arrays temporales ni de ordenar.
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < NEAR_LIGHTS_PER_SIDE; i++) nearBestDist[side][i] = Infinity;
    }
    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      const group = groupRefs.current[slot];
      if (!group) continue;
      const worldZ = group.position.z;
      for (const post of SLOT_LIGHTS[slot]) {
        const side = post.x < 0 ? 0 : 1;
        const z = worldZ + post.z;
        const d = Math.abs(z - CHARACTER_Z);
        const dists = nearBestDist[side];
        if (d >= dists[NEAR_LIGHTS_PER_SIDE - 1]) continue;
        let insertAt = NEAR_LIGHTS_PER_SIDE - 1;
        while (insertAt > 0 && dists[insertAt - 1] > d) {
          dists[insertAt] = dists[insertAt - 1];
          nearBestX[side][insertAt] = nearBestX[side][insertAt - 1];
          nearBestZ[side][insertAt] = nearBestZ[side][insertAt - 1];
          insertAt--;
        }
        dists[insertAt] = d;
        nearBestX[side][insertAt] = post.x;
        nearBestZ[side][insertAt] = z;
      }
    }

    // Cada `pointLight` real "salta" al farol físico que le toca este
    // frame — nunca vive en una posición fija del mundo, así que a medida
    // que se avanza siempre es un farol de verdad el que está encendido
    // junto al personaje, y va cambiando de mano en mano con el recorrido.
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < NEAR_LIGHTS_PER_SIDE; i++) {
        const light = nearLightRefs.current[side * NEAR_LIGHTS_PER_SIDE + i];
        if (!light) continue;
        if (Number.isFinite(nearBestDist[side][i])) {
          light.position.set(nearBestX[side][i], 0.5, nearBestZ[side][i]);
          light.intensity = skyState.nightFactor * 0.85;
        } else {
          light.intensity = 0;
        }
      }
    }
  });

  return (
    <>
      {Array.from({ length: TOTAL_TILES }).map((_, slot) => (
        <group
          key={slot}
          ref={(el) => {
            groupRefs.current[slot] = el;
          }}
          position={[0, 0.01, tileRenderZ(indices[slot], 0)]}
        >
          {/* Un toque de emisivo constante (mismo truco que las montañas
              lejanas) mantiene el camino reconocible de noche en vez de
              volverse un gris uniforme casi negro bajo poca luz ambiente. */}
          <mesh geometry={fillGeometry} receiveShadow>
            <meshStandardMaterial color={colors.roadFill} emissive={colors.roadFill} emissiveIntensity={0.1} roughness={1} />
          </mesh>
          <mesh geometry={edgeGeometry} position={[-ROAD_WIDTH / 2 + 0.05, 0.001, 0]} receiveShadow>
            <meshStandardMaterial color={colors.roadEdge} emissive={colors.roadEdge} emissiveIntensity={0.1} roughness={1} />
          </mesh>
          <mesh geometry={edgeGeometry} position={[ROAD_WIDTH / 2 - 0.05, 0.001, 0]} receiveShadow>
            <meshStandardMaterial color={colors.roadEdge} emissive={colors.roadEdge} emissiveIntensity={0.1} roughness={1} />
          </mesh>

          {/* Faroles: pequeñas esferas emisivas compartiendo un único
              material — invisibles de día, cálidas de noche. */}
          {SLOT_LIGHTS[slot].map((post, i) => (
            <mesh key={i} geometry={lightGeometry} material={lightMaterial} position={[post.x, 0.12, post.z]} />
          ))}
        </group>
      ))}

      {/* Solo un puñado de luces reales (no una por farol): cada una se
          reposiciona cuadro a cuadro sobre el farol físico más cercano al
          personaje de su lado (ver useFrame más arriba), así que siempre es
          un farol de verdad el que ilumina el camino/césped/girasoles
          cercanos, y ese farol cambia a medida que se avanza — nunca queda
          una luz flotando en un punto fijo del aire. El resto de los
          faroles (la mayoría) solo brillan por su propio material emisivo,
          sin costo de una PointLight adicional. */}
      {[0, 1].map((side) =>
        Array.from({ length: NEAR_LIGHTS_PER_SIDE }).map((_, i) => (
          <pointLight
            key={`${side}-${i}`}
            ref={(el) => {
              nearLightRefs.current[side * NEAR_LIGHTS_PER_SIDE + i] = el;
            }}
            position={[(side === 0 ? -1 : 1) * (ROAD_WIDTH / 2 + 0.55), 0.5, CHARACTER_Z]}
            color={colors.sunGlow}
            intensity={0}
            distance={4.2}
            decay={2}
          />
        )),
      )}
    </>
  );
}
