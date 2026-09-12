import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { ROAD_WIDTH, TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';

const PER_TILE = 5;
const COUNT = PER_TILE * TOTAL_TILES;

interface BushLocal {
  x: number;
  z: number;
  scale: number;
  rotationY: number;
}

function generateBushes(index: number): BushLocal[] {
  const random = createSeededRandom(index * 5153 + 37);
  const out: BushLocal[] = [];
  for (let i = 0; i < PER_TILE; i++) {
    const side = random() < 0.5 ? -1 : 1;
    out.push({
      x: side * randomBetween(random, ROAD_WIDTH / 2 + 0.6, ROAD_WIDTH / 2 + 6),
      z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
      scale: randomBetween(random, 0.35, 0.7),
      rotationY: random() * Math.PI * 2,
    });
  }
  return out;
}

/** Pequeños arbustos redondeados junto al camino: vegetación sutil que
 * rompe la monotonía del campo sin competir visualmente con los girasoles. */
export function Vegetation() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scrollState = useScrollState();
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<BushLocal[][]>(indices.map((index) => generateBushes(index))).current;

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 7, 5), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const distance = scrollState.current.smoothDistance;
    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    const recycled = recycleTileIndices(indices, targetMinIndex);

    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      if (recycled[slot]) tileLocals[slot] = generateBushes(indices[slot]);
      const tileWorldZ = tileRenderZ(indices[slot], distance);
      const locals = tileLocals[slot];

      for (let i = 0; i < locals.length; i++) {
        const b = locals[i];
        dummy.position.set(b.x, b.scale * 0.65, tileWorldZ + b.z);
        dummy.rotation.set(0, b.rotationY, 0);
        dummy.scale.set(b.scale, b.scale * 0.8, b.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(slot * PER_TILE + i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, COUNT]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial color={colors.stemDark} roughness={1} />
    </instancedMesh>
  );
}
