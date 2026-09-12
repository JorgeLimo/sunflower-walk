import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSunflowerGeometry } from '../../lib/sunflowerGeometry';
import { generateTileFlowers, type FlowerLocal } from '../../lib/generateTileFlowers';
import { TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import type { SunflowerTierCounts } from '../../lib/viewport';

interface SunflowersProps {
  counts: SunflowerTierCounts;
}

/**
 * Campo de girasoles infinito: un único InstancedMesh cuyas instancias
 * pertenecen a "tiles" (segmentos) que se reciclan junto con el camino.
 * Al reciclarse un segmento se regenera su disposición local (determinística
 * por índice), así que el campo nunca se ve repetido de forma obvia aunque
 * la cantidad de memoria usada sea constante.
 */
export function Sunflowers({ counts }: SunflowersProps) {
  const perTile = counts.foreground + counts.mid + counts.background;
  const totalCount = perTile * TOTAL_TILES;

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createSunflowerGeometry(), []);
  const scrollState = useScrollState();

  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<FlowerLocal[][]>(
    indices.map((index) => generateTileFlowers(index, counts)),
  ).current;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const windAxis = useMemo(() => new THREE.Vector3(1, 0, 0.3).normalize(), []);
  const baseQuat = useMemo(() => new THREE.Quaternion(), []);
  const windQuat = useMemo(() => new THREE.Quaternion(), []);
  const baseEuler = useMemo(() => new THREE.Euler(), []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const distance = scrollState.current.smoothDistance;

    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    const recycled = recycleTileIndices(indices, targetMinIndex);

    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      if (recycled[slot]) {
        tileLocals[slot] = generateTileFlowers(indices[slot], counts);
      }

      const tileWorldZ = tileRenderZ(indices[slot], distance);
      const locals = tileLocals[slot];

      for (let i = 0; i < locals.length; i++) {
        const f = locals[i];
        const instanceIndex = slot * perTile + i;
        const wind = Math.sin(t * f.speed + f.phase) * 0.09;

        dummy.position.set(f.x, 0, tileWorldZ + f.z);
        baseEuler.set(f.tiltX, f.rotationY, f.tiltZ);
        baseQuat.setFromEuler(baseEuler);
        windQuat.setFromAxisAngle(windAxis, wind);
        dummy.quaternion.copy(windQuat).multiply(baseQuat);
        dummy.scale.set(f.scaleXZ, f.scaleY, f.scaleXZ);
        dummy.updateMatrix();
        mesh.setMatrixAt(instanceIndex, dummy.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, totalCount]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial vertexColors roughness={0.85} />
    </instancedMesh>
  );
}
