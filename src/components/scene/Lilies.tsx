import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createLilyGeometry } from '../../lib/lilyGeometry';
import {
  generateTileLilies,
  computeLilyVariantCounts,
  LILY_VARIANT_KEYS,
  type LilyLocal,
  type LilyVariantKey,
  type LilyTier,
  type LilyTierCounts,
} from '../../lib/generateTileLilies';
import { TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';

interface LiliesProps {
  counts: LilyTierCounts;
}

const SEED_BY_VARIANT: Record<LilyVariantKey, number> = {
  'near-a': 411,
  'near-b': 431,
  'far-a': 412,
  'far-b': 432,
};

// Igual que en Sunflowers.tsx: solo la franja cercana recalcula su balanceo
// cuadro a cuadro. La lejana solo reescribe su matriz LOCAL al reciclar — el
// avance suave por scroll lo aporta el `<group>` de cada slot, no esto.
const WIND_BY_TIER: Record<LilyTier, boolean> = {
  near: true,
  far: false,
};

function variantTier(key: LilyVariantKey): LilyTier {
  return key.split('-')[0] as LilyTier;
}

/**
 * Campo de lirios blancos: especie complementaria del campo de girasoles,
 * pensada para llenar el césped que quedaba liso entre grupos de girasoles
 * sin nunca competir con ellos en protagonismo. Mismo patrón de tiles que
 * `Sunflowers.tsx` (un `<group>` por slot cuya posición se actualiza TODOS
 * los cuadros, con coordenadas de instancia puramente locales) — ver el
 * comentario en Sunflowers.tsx sobre por qué esto es imprescindible para que
 * las plantas lejanas avancen con el scroll en vez de quedarse congeladas
 * entre reciclados.
 *
 * A diferencia del girasol, cada lirio es UNA sola malla fusionada (no
 * tallo+cabeza separados): a esta escala y con este rol secundario, un
 * balanceo de bloque entero es indistinguible de uno articulado.
 */
export function Lilies({ counts }: LiliesProps) {
  const variantCounts = useMemo(() => computeLilyVariantCounts(counts), [counts]);

  const geometries = useMemo(() => {
    const map = {} as Record<LilyVariantKey, THREE.BufferGeometry>;
    LILY_VARIANT_KEYS.forEach((key) => {
      map[key] = createLilyGeometry(SEED_BY_VARIANT[key], variantTier(key));
    });
    return map;
  }, []);

  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const meshRefs = useRef<Partial<Record<LilyVariantKey, (THREE.InstancedMesh | null)[]>>>({});

  const scrollState = useScrollState();
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<Record<LilyVariantKey, LilyLocal[]>[]>(
    indices.map((index) => generateTileLilies(index, counts)),
  ).current;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const windAxis = useMemo(() => new THREE.Vector3(1, 0, 0.4).normalize(), []);
  const baseQuat = useMemo(() => new THREE.Quaternion(), []);
  const windQuat = useMemo(() => new THREE.Quaternion(), []);
  const finalQuat = useMemo(() => new THREE.Quaternion(), []);
  const baseEuler = useMemo(() => new THREE.Euler(), []);

  // Blanco→crema por instancia, mismo mecanismo que el tinte del girasol.
  const tintA = useMemo(() => new THREE.Color('#ffffff'), []);
  const tintB = useMemo(() => new THREE.Color('#f6ecd2'), []);
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
      // Avance continuo, siempre, sin importar el nivel de viento de sus
      // variantes — escritura escalar barata (ver Sunflowers.tsx).
      const group = groupRefs.current[slot];
      if (group) group.position.z = tileRenderZ(indices[slot], distance);

      if (recycled[slot]) {
        tileLocals[slot] = generateTileLilies(indices[slot], counts);
      }
      const colorsChanged = recycled[slot] || isFirstFrame;

      for (const key of LILY_VARIANT_KEYS) {
        const mesh = meshRefs.current[key]?.[slot];
        if (!mesh) continue;
        if (!WIND_BY_TIER[variantTier(key)] && !recycled[slot] && !isFirstFrame) continue;

        const locals = tileLocals[slot][key];
        const perSlot = variantCounts[key];

        for (let i = 0; i < perSlot; i++) {
          const f = locals[i];
          if (!f) {
            dummy.position.set(0, 0, 0);
            dummy.quaternion.identity();
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            continue;
          }

          baseEuler.set(f.tiltX, f.rotationY, f.tiltZ);
          baseQuat.setFromEuler(baseEuler);

          const sway = Math.sin(t * f.speed + f.phase) * 0.09;
          windQuat.setFromAxisAngle(windAxis, sway);
          finalQuat.copy(windQuat).multiply(baseQuat);

          dummy.position.set(f.x, 0, f.z);
          dummy.quaternion.copy(finalQuat);
          dummy.scale.setScalar(f.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);

          if (colorsChanged) {
            scratchColor.copy(tintA).lerp(tintB, f.tint);
            mesh.setColorAt(i, scratchColor);
          }
        }

        if (WIND_BY_TIER[variantTier(key)] || recycled[slot] || isFirstFrame) {
          mesh.instanceMatrix.needsUpdate = true;
        }
        if (colorsChanged && mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
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
          position={[0, 0, tileRenderZ(indices[slot], 0)]}
        >
          {LILY_VARIANT_KEYS.filter((key) => variantCounts[key] > 0).map((key) => (
            <instancedMesh
              key={key}
              ref={(el) => {
                (meshRefs.current[key] ??= [])[slot] = el;
              }}
              args={[geometries[key], undefined, variantCounts[key]]}
              frustumCulled={false}
            >
              {/* Doble cara: hojas y tépalos son tiras de un solo plano. */}
              <meshStandardMaterial vertexColors roughness={0.7} side={THREE.DoubleSide} />
            </instancedMesh>
          ))}
        </group>
      ))}
    </>
  );
}
