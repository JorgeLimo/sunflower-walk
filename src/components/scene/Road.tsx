import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { ROAD_WIDTH, TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';

/**
 * El camino se construye con un número fijo de segmentos ("tiles") que se
 * reciclan a medida que el personaje avanza: el segmento que queda muy
 * atrás salta hacia adelante en vez de crear geometría nueva. Da la
 * sensación de un camino infinito con memoria constante.
 */
export function Road() {
  const scrollState = useScrollState();
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const indices = useRef<number[]>(createInitialTileIndices()).current;

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
          <mesh geometry={fillGeometry} receiveShadow>
            <meshStandardMaterial color={colors.roadFill} roughness={1} />
          </mesh>
          <mesh geometry={edgeGeometry} position={[-ROAD_WIDTH / 2 + 0.05, 0.001, 0]} receiveShadow>
            <meshStandardMaterial color={colors.roadEdge} roughness={1} />
          </mesh>
          <mesh geometry={edgeGeometry} position={[ROAD_WIDTH / 2 - 0.05, 0.001, 0]} receiveShadow>
            <meshStandardMaterial color={colors.roadEdge} roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}
