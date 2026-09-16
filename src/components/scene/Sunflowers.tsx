import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createSunflowerHeadGeometry,
  createSunflowerStemGeometry,
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
  'foreground-mature-a': 101,
  'foreground-mature-b': 131,
  'foreground-young-a': 102,
  'foreground-young-b': 132,
  'mid-mature-a': 201,
  'mid-mature-b': 231,
  'mid-young-a': 202,
  'mid-young-b': 232,
  'background-mature-a': 301,
  'background-mature-b': 331,
  'background-young-a': 302,
  'background-young-b': 332,
};

// Solo las plantas cercanas proyectan/reciben sombra: la cámara de sombras
// cubre ±20 unidades alrededor del personaje, así que las del fondo nunca
// llegarían al mapa de sombras — pero como los InstancedMesh van con
// `frustumCulled={false}`, igual se dibujarían en esa pasada. Apagarlas ahí
// evita pagar dos veces por las ~1500 instancias de fondo.
const CASTS_SHADOW_BY_TIER: Record<SunflowerTier, boolean> = {
  foreground: true,
  mid: false,
  background: false,
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

  // Tinte por instancia (blanco→cálido para la cabeza, blanco→verde pálido
  // para el tallo): three.js multiplica automáticamente `instanceColor` por
  // el color de vértice ya horneado en la geometría compartida, así que
  // cada planta puede verse un poco distinta sin duplicar geometría.
  const headTintA = useMemo(() => new THREE.Color('#fffef2'), []);
  const headTintB = useMemo(() => new THREE.Color('#ffe9ac'), []);
  const stemTintA = useMemo(() => new THREE.Color('#ffffff'), []);
  const stemTintB = useMemo(() => new THREE.Color('#eef5df'), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);
  const firstFrame = useRef(true);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const distance = scrollState.current.smoothDistance;
    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    const recycled = recycleTileIndices(indices, targetMinIndex);
    const isFirstFrame = firstFrame.current;
    firstFrame.current = false;

    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      if (recycled[slot]) {
        tileLocals[slot] = generateTileFlowers(indices[slot], counts);
      }
      const colorsChanged = recycled[slot] || isFirstFrame;

      const tileWorldZ = tileRenderZ(indices[slot], distance);

      for (const key of SUNFLOWER_VARIANT_KEYS) {
        const stemMesh = stemRefs.current[key];
        const headMesh = headRefs.current[key];
        if (!stemMesh || !headMesh) continue;

        // Punta REAL del tallo curvado (posición y orientación), publicada por
        // createSunflowerStemGeometry. Usar (0, stemHeight, 0) dejaba la
        // cabeza flotando separada del tallo en cuanto la planta tenía curva.
        const stemGeometry = geometries[key].stem;
        const tip = stemGeometry.userData.tip as THREE.Vector3;
        const tipQuat = stemGeometry.userData.tipQuat as THREE.Quaternion;
        const locals = tileLocals[slot][key];
        const perSlot = variantCounts[key];

        for (let i = 0; i < perSlot; i++) {
          const instanceIndex = slot * perSlot + i;
          const f = locals[i];
          // Puede haber menos plantas que huecos: si no se encontró sitio
          // respetando la separación mínima, la instancia sobrante se colapsa
          // a escala 0 en vez de quedarse con la matriz del tile anterior.
          if (!f) {
            dummy.position.set(0, 0, 0);
            dummy.quaternion.identity();
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            stemMesh.setMatrixAt(instanceIndex, dummy.matrix);
            headMesh.setMatrixAt(instanceIndex, dummy.matrix);
            continue;
          }

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

          // La punta se escala por eje igual que el tallo (scaleXZ, scaleY,
          // scaleXZ) ANTES de rotar con la orientación de la planta.
          topOffset.set(tip.x * f.scaleXZ, tip.y * f.scaleY, tip.z * f.scaleXZ).applyQuaternion(finalStemQuat);

          const headWind = Math.sin(t * f.headSpeed + f.headPhase) * 0.05;
          headWindQuat.setFromAxisAngle(headWindAxis, headWind);
          // La cabeza hereda además la inclinación acumulada de la curva del
          // tallo, así que "cabecea" siguiéndolo en vez de quedar recta.
          finalHeadQuat.copy(headWindQuat).multiply(finalStemQuat).multiply(tipQuat);

          dummy.position.set(f.x + topOffset.x, topOffset.y, tileWorldZ + f.z + topOffset.z);
          dummy.quaternion.copy(finalHeadQuat);
          dummy.scale.set(f.scaleXZ, f.scaleXZ, f.scaleXZ);
          dummy.updateMatrix();
          headMesh.setMatrixAt(instanceIndex, dummy.matrix);

          if (colorsChanged) {
            scratchColor.copy(headTintA).lerp(headTintB, f.tint);
            headMesh.setColorAt(instanceIndex, scratchColor);
            scratchColor.copy(stemTintA).lerp(stemTintB, f.tint);
            stemMesh.setColorAt(instanceIndex, scratchColor);
          }
        }
      }
    }

    const colorsTouched = isFirstFrame || recycled.some(Boolean);
    for (const key of SUNFLOWER_VARIANT_KEYS) {
      const stemMesh = stemRefs.current[key];
      const headMesh = headRefs.current[key];
      if (stemMesh) stemMesh.instanceMatrix.needsUpdate = true;
      if (headMesh) headMesh.instanceMatrix.needsUpdate = true;
      if (colorsTouched) {
        if (stemMesh?.instanceColor) stemMesh.instanceColor.needsUpdate = true;
        if (headMesh?.instanceColor) headMesh.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <>
      {SUNFLOWER_VARIANT_KEYS.filter((key) => variantCounts[key] > 0).map((key) => {
        const total = variantCounts[key] * TOTAL_TILES;
        const shadows = CASTS_SHADOW_BY_TIER[variantTier(key)];
        return (
          <group key={key}>
            <instancedMesh
              ref={(el) => {
                if (el) stemRefs.current[key] = el;
              }}
              args={[geometries[key].stem, undefined, total]}
              castShadow={shadows}
              receiveShadow={shadows}
              frustumCulled={false}
            >
              {/* Doble cara obligatoria: las hojas son tiras de un solo plano,
                  así que sin esto las que quedaban de espaldas a la luz o a la
                  cámara desaparecían y la planta se veía medio pelada. */}
              <meshStandardMaterial vertexColors roughness={0.85} side={THREE.DoubleSide} />
            </instancedMesh>
            <instancedMesh
              ref={(el) => {
                if (el) headRefs.current[key] = el;
              }}
              args={[geometries[key].head, undefined, total]}
              castShadow={shadows}
              receiveShadow={shadows}
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
