import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createSunflowerHeadGeometry,
  createSunflowerStemGeometry,
  STEM_HEIGHT_BY_MATURITY,
  type SunflowerDetail,
} from '../../lib/sunflowerGeometry';
import {
  generateTileFlowers,
  computeVariantCounts,
  SUNFLOWER_VARIANT_KEYS,
  type FlowerLocal,
  type SunflowerVariantKey,
  type SunflowerTier,
} from '../../lib/generateTileFlowers';
import { TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import type { SunflowerTierCounts } from '../../lib/viewport';

interface SunflowersProps {
  counts: SunflowerTierCounts;
}

const DETAIL_BY_TIER: Record<SunflowerTier, SunflowerDetail> = {
  foreground: 'high',
  mid: 'medium',
  background: 'low',
};

const SEED_BY_VARIANT: Record<SunflowerVariantKey, number> = {
  'foreground-mature': 101,
  'foreground-young': 102,
  'mid-mature': 201,
  'mid-young': 202,
  'background-mature': 301,
  'background-young': 302,
};

function variantTier(key: SunflowerVariantKey): SunflowerTier {
  return key.split('-')[0] as SunflowerTier;
}

function variantMaturity(key: SunflowerVariantKey) {
  return key.split('-')[1] as 'mature' | 'young';
}

/**
 * Campo de girasoles infinito. Cada variante (franja de profundidad x
 * madurez) es en realidad DOS InstancedMesh: tallo+hojas y cabeza+pétalos.
 * Separarlos permite que el viento doble el tallo y que la cabeza seiga ese
 * movimiento con un balanceo propio, en vez de rotar la planta entera como
 * un bloque rígido.
 */
export function Sunflowers({ counts }: SunflowersProps) {
  const variantCounts = useMemo(() => computeVariantCounts(counts), [counts]);

  const geometries = useMemo(() => {
    const map = {} as Record<SunflowerVariantKey, { stem: THREE.BufferGeometry; head: THREE.BufferGeometry }>;
    SUNFLOWER_VARIANT_KEYS.forEach((key) => {
      const tier = variantTier(key);
      const maturity = variantMaturity(key);
      const detail = DETAIL_BY_TIER[tier];
      const seed = SEED_BY_VARIANT[key];
      map[key] = {
        stem: createSunflowerStemGeometry(seed, detail, maturity),
        head: createSunflowerHeadGeometry(seed, detail, maturity),
      };
    });
    return map;
  }, []);

  const stemRefs = useRef<Partial<Record<SunflowerVariantKey, THREE.InstancedMesh>>>({});
  const headRefs = useRef<Partial<Record<SunflowerVariantKey, THREE.InstancedMesh>>>({});

  const scrollState = useScrollState();
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<Record<SunflowerVariantKey, FlowerLocal[]>[]>(
    indices.map((index) => generateTileFlowers(index, counts)),
  ).current;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const stemWindAxis = useMemo(() => new THREE.Vector3(1, 0, 0.3).normalize(), []);
  const headWindAxis = useMemo(() => new THREE.Vector3(0.6, 0, 1).normalize(), []);
  const baseQuat = useMemo(() => new THREE.Quaternion(), []);
  const stemWindQuat = useMemo(() => new THREE.Quaternion(), []);
  const headWindQuat = useMemo(() => new THREE.Quaternion(), []);
  const finalStemQuat = useMemo(() => new THREE.Quaternion(), []);
  const finalHeadQuat = useMemo(() => new THREE.Quaternion(), []);
  const baseEuler = useMemo(() => new THREE.Euler(), []);
  const topOffset = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const distance = scrollState.current.smoothDistance;
    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    const recycled = recycleTileIndices(indices, targetMinIndex);

    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      if (recycled[slot]) {
        tileLocals[slot] = generateTileFlowers(indices[slot], counts);
      }

      const tileWorldZ = tileRenderZ(indices[slot], distance);

      for (const key of SUNFLOWER_VARIANT_KEYS) {
        const stemMesh = stemRefs.current[key];
        const headMesh = headRefs.current[key];
        if (!stemMesh || !headMesh) continue;

        const stemHeight = STEM_HEIGHT_BY_MATURITY[variantMaturity(key)];
        const locals = tileLocals[slot][key];
        const perSlot = variantCounts[key];

        for (let i = 0; i < perSlot; i++) {
          const instanceIndex = slot * perSlot + i;
          const f = locals[i];

          baseEuler.set(f.tiltX, f.rotationY, f.tiltZ);
          baseQuat.setFromEuler(baseEuler);

          const stemWind = Math.sin(t * f.speed + f.phase) * 0.07;
          stemWindQuat.setFromAxisAngle(stemWindAxis, stemWind);
          finalStemQuat.copy(stemWindQuat).multiply(baseQuat);

          dummy.position.set(f.x, 0, tileWorldZ + f.z);
          dummy.quaternion.copy(finalStemQuat);
          dummy.scale.set(f.scaleXZ, f.scaleY, f.scaleXZ);
          dummy.updateMatrix();
          stemMesh.setMatrixAt(instanceIndex, dummy.matrix);

          topOffset.set(0, stemHeight * f.scaleY, 0).applyQuaternion(finalStemQuat);

          const headWind = Math.sin(t * f.headSpeed + f.headPhase) * 0.05;
          headWindQuat.setFromAxisAngle(headWindAxis, headWind);
          finalHeadQuat.copy(headWindQuat).multiply(finalStemQuat);

          dummy.position.set(f.x + topOffset.x, topOffset.y, tileWorldZ + f.z + topOffset.z);
          dummy.quaternion.copy(finalHeadQuat);
          dummy.scale.set(f.scaleXZ, f.scaleXZ, f.scaleXZ);
          dummy.updateMatrix();
          headMesh.setMatrixAt(instanceIndex, dummy.matrix);
        }
      }
    }

    for (const key of SUNFLOWER_VARIANT_KEYS) {
      const stemMesh = stemRefs.current[key];
      const headMesh = headRefs.current[key];
      if (stemMesh) stemMesh.instanceMatrix.needsUpdate = true;
      if (headMesh) headMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {SUNFLOWER_VARIANT_KEYS.filter((key) => variantCounts[key] > 0).map((key) => {
        const total = variantCounts[key] * TOTAL_TILES;
        return (
          <group key={key}>
            <instancedMesh
              ref={(el) => {
                if (el) stemRefs.current[key] = el;
              }}
              args={[geometries[key].stem, undefined, total]}
              castShadow
              receiveShadow
              frustumCulled={false}
            >
              <meshStandardMaterial vertexColors roughness={0.85} />
            </instancedMesh>
            <instancedMesh
              ref={(el) => {
                if (el) headRefs.current[key] = el;
              }}
              args={[geometries[key].head, undefined, total]}
              castShadow
              receiveShadow
              frustumCulled={false}
            >
              <meshStandardMaterial vertexColors roughness={0.8} side={THREE.DoubleSide} />
            </instancedMesh>
          </group>
        );
      })}
    </>
  );
}
