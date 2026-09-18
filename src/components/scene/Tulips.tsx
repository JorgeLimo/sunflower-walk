import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createTulipGeometry } from '../../lib/tulipGeometry';
import {
  generateTileTulips,
  computeTulipVariantCounts,
  TULIP_VARIANT_KEYS,
  type TulipLocal,
  type TulipVariantKey,
  type TulipTier,
  type TulipTierCounts,
} from '../../lib/generateTileTulips';
import { TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import { colors } from '../../lib/colors';
import { windGustFactor } from '../../lib/wind';

interface TulipsProps {
  counts: TulipTierCounts;
}

const SEED_BY_VARIANT: Record<TulipVariantKey, number> = {
  'near-a': 511,
  'near-b': 531,
  'far-a': 512,
  'far-b': 532,
};

// Igual que en Sunflowers.tsx/Lilies.tsx: solo la franja cercana recalcula
// su balanceo cuadro a cuadro. La lejana solo reescribe su matriz LOCAL al
// reciclar — el avance suave por scroll lo aporta el `<group>` de cada
// slot, no esto.
const WIND_BY_TIER: Record<TulipTier, boolean> = {
  near: true,
  far: false,
};

function variantTier(key: TulipVariantKey): TulipTier {
  return key.split('-')[0] as TulipTier;
}

/**
 * Campo de tulipanes rosa pastel y blanco: cuarta especie del campo (junto a
 * girasol, lirio y florecillas silvestres), tan secundaria como el lirio.
 * Mismo patrón de tiles que `Sunflowers.tsx`/`Lilies.tsx` (un `<group>` por
 * slot cuya posición se actualiza TODOS los cuadros, con coordenadas de
 * instancia puramente locales) — ver el comentario en Sunflowers.tsx sobre
 * por qué esto es imprescindible para que las plantas lejanas avancen con
 * el scroll en vez de quedarse congeladas entre reciclados.
 *
 * A diferencia del lirio (tinte continuo blanco→crema), el color del
 * tulipán es una elección DISCRETA por instancia (rosa pastel o blanco
 * cálido, ver `TulipLocal.isPink`) con solo una variación sutil de matiz —
 * mezclar los dos colores a medias los volvería un rosa lavado confuso en
 * vez de "dos colores claramente distintos conviviendo en el mismo grupo".
 */
export function Tulips({ counts }: TulipsProps) {
  const variantCounts = useMemo(() => computeTulipVariantCounts(counts), [counts]);

  const geometries = useMemo(() => {
    const map = {} as Record<TulipVariantKey, THREE.BufferGeometry>;
    TULIP_VARIANT_KEYS.forEach((key) => {
      map[key] = createTulipGeometry(SEED_BY_VARIANT[key], variantTier(key));
    });
    return map;
  }, []);

  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const meshRefs = useRef<Partial<Record<TulipVariantKey, (THREE.InstancedMesh | null)[]>>>({});

  const scrollState = useScrollState();
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<Record<TulipVariantKey, TulipLocal[]>[]>(
    indices.map((index) => generateTileTulips(index, counts)),
  ).current;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const windAxis = useMemo(() => new THREE.Vector3(1, 0, 0.4).normalize(), []);
  const baseQuat = useMemo(() => new THREE.Quaternion(), []);
  const windQuat = useMemo(() => new THREE.Quaternion(), []);
  const finalQuat = useMemo(() => new THREE.Quaternion(), []);
  const baseEuler = useMemo(() => new THREE.Euler(), []);

  const pinkColor = useMemo(() => new THREE.Color(colors.tulipPink), []);
  const whiteColor = useMemo(() => new THREE.Color(colors.tulipWhite), []);
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
      const groupZ = tileRenderZ(indices[slot], distance);
      if (group) group.position.z = groupZ;

      if (recycled[slot]) {
        tileLocals[slot] = generateTileTulips(indices[slot], counts);
      }
      const colorsChanged = recycled[slot] || isFirstFrame;

      for (const key of TULIP_VARIANT_KEYS) {
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

          const gust = windGustFactor(f.x, groupZ + f.z, t);
          const sway = Math.sin(t * f.speed + f.phase) * 0.08 * gust;
          windQuat.setFromAxisAngle(windAxis, sway);
          finalQuat.copy(windQuat).multiply(baseQuat);

          dummy.position.set(f.x, 0, f.z);
          dummy.quaternion.copy(finalQuat);
          dummy.scale.setScalar(f.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);

          if (colorsChanged) {
            // Color discreto (rosa o blanco) más una variación sutil de
            // matiz/luminosidad por instancia, para que no todas las flores
            // del mismo color sean el píxel idéntico.
            scratchColor.copy(f.isPink ? pinkColor : whiteColor);
            scratchColor.offsetHSL(0, 0, (f.phase % 1) * 0.06 - 0.03);
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
          {TULIP_VARIANT_KEYS.filter((key) => variantCounts[key] > 0).map((key) => (
            <instancedMesh
              key={key}
              ref={(el) => {
                (meshRefs.current[key] ??= [])[slot] = el;
              }}
              args={[geometries[key], undefined, variantCounts[key]]}
              frustumCulled={false}
            >
              {/* Doble cara: hojas y pétalos son tiras de un solo plano. */}
              <meshStandardMaterial vertexColors roughness={0.65} side={THREE.DoubleSide} />
            </instancedMesh>
          ))}
        </group>
      ))}
    </>
  );
}
