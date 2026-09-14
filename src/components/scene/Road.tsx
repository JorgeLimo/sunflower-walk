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

const LIGHTS_PER_SIDE = 2;

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
      const z = baseZ + randomBetween(random, -2, 2);
      // Separados del camino a propósito (nunca pegados al borde).
      const x = side * (ROAD_WIDTH / 2 + randomBetween(random, 0.35, 0.75));
      posts.push({ x, z });
    }
  }
  return posts;
}

const SLOT_LIGHTS: LightPost[][] = Array.from({ length: TOTAL_TILES }, (_, slot) => generateSlotLights(slot));

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
    for (const light of nearLightRefs.current) {
      if (light) light.intensity = skyState.nightFactor * 1.1;
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

      {/* Solo un puñado de faroles "cercanos" (los que van a estar siempre
          junto al personaje, sin importar qué tile físico les toque en
          este momento) llevan además una luz real de rango corto — así el
          camino y el césped/tallos inmediatos alrededor del personaje se
          ven realmente iluminados de noche, sin montar una PointLight por
          cada farol del camino. */}
      {[-9, 3].map((zOffset, pairIndex) => (
        <group key={pairIndex}>
          {[-1, 1].map((side) => (
            <pointLight
              key={side}
              ref={(el) => {
                nearLightRefs.current[pairIndex * 2 + (side === -1 ? 0 : 1)] = el;
              }}
              position={[side * (ROAD_WIDTH / 2 + 0.55), 0.5, CHARACTER_Z + zOffset]}
              color={colors.sunGlow}
              intensity={0}
              distance={5}
              decay={2}
            />
          ))}
        </group>
      ))}
    </>
  );
}
