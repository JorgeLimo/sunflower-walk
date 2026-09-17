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

// El balanceo de viento (cuaterniones + composición de matriz por instancia)
// solo se recalcula cuadro a cuadro para la franja de primer plano, que es la
// que bordea el camino y donde el vaivén se aprecia de verdad: a partir de
// ~4 unidades de distancia la amplitud (0.07 rad sobre una planta de medio
// metro) queda por debajo del píxel. Las demás franjas solo recalculan sus
// matrices LOCALES cuando el segmento se recicla.
//
// Importante: esto NO decide si la planta avanza con el scroll — eso lo hace
// el `<group>` de cada slot (ver más abajo), que se mueve TODOS los cuadros
// sin importar el nivel de viento. Antes esta bandera controlaba también la
// posición, y las franjas sin viento quedaban con su `tileWorldZ` congelado
// en el valor del último reciclado: entre un reciclado y el siguiente no se
// movían nada, y al reciclar saltaban de golpe a la posición correcta — un
// tirón claramente perceptible, más frecuente cuanto más rápido se scrollea
// (el reciclado depende de la distancia recorrida, no del tiempo).
const WIND_BY_TIER: Record<SunflowerTier, boolean> = {
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
 * madurez x estilo) es en realidad DOS InstancedMesh por SLOT de tile
 * (tallo+hojas, y cabeza+pétalos): separarlos permite que el viento doble el
 * tallo y que la cabeza siga ese movimiento con un balanceo propio, en vez
 * de rotar la planta entera como un bloque rígido.
 *
 * Cada slot vive dentro de su propio `<group>` (mismo patrón que Road.tsx),
 * cuya posición Z seguimos actualizando cuadro a cuadro sin importar el
 * nivel de detalle — es una escritura escalar por slot, no por instancia, así
 * que es esencialmente gratis. Las coordenadas de cada `FlowerLocal` son
 * LOCALES al tile (nunca se les suma `tileWorldZ`), así que el avance suave
 * por scroll queda totalmente desacoplado de cuán caro sea recalcular la
 * matriz de cada instancia — lo segundo solo hace falta al reciclar el slot
 * (nueva disposición de plantas) o, en primer plano, para el balanceo del
 * viento.
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

  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const stemRefs = useRef<Partial<Record<SunflowerVariantKey, (THREE.InstancedMesh | null)[]>>>({});
  const headRefs = useRef<Partial<Record<SunflowerVariantKey, (THREE.InstancedMesh | null)[]>>>({});

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
      // Avance continuo del segmento: SIEMPRE, sin importar el nivel de
      // viento/detalle de sus variantes — es una escritura escalar, no toca
      // ninguna instancia, así que no hay optimización que valga la pena
      // aplicarle. Esto es lo que mantiene a las plantas del fondo avanzando
      // en el mismo tren que las de primer plano en vez de quedarse quietas
      // entre reciclados.
      const group = groupRefs.current[slot];
      if (group) group.position.z = tileRenderZ(indices[slot], distance);

      if (recycled[slot]) {
        tileLocals[slot] = generateTileFlowers(indices[slot], counts);
      }
      const colorsChanged = recycled[slot] || isFirstFrame;

      for (const key of SUNFLOWER_VARIANT_KEYS) {
        const stemMesh = stemRefs.current[key]?.[slot];
        const headMesh = headRefs.current[key]?.[slot];
        if (!stemMesh || !headMesh) continue;
        // Sin viento y sin regeneración, las matrices LOCALES del frame
        // anterior siguen siendo válidas tal cual (la posición del conjunto
        // ya la mueve el `<group>` de arriba): no hay nada que recalcular.
        if (!WIND_BY_TIER[variantTier(key)] && !recycled[slot] && !isFirstFrame) continue;

        // Punta REAL del tallo curvado (posición y orientación), publicada por
        // createSunflowerStemGeometry. Usar (0, stemHeight, 0) dejaba la
        // cabeza flotando separada del tallo en cuanto la planta tenía curva.
        const stemGeometry = geometries[key].stem;
        const tip = stemGeometry.userData.tip as THREE.Vector3;
        const tipQuat = stemGeometry.userData.tipQuat as THREE.Quaternion;
        const locals = tileLocals[slot][key];
        const perSlot = variantCounts[key];

        for (let i = 0; i < perSlot; i++) {
          const f = locals[i];
          // Puede haber menos plantas que huecos: si no se encontró sitio
          // respetando la separación mínima, la instancia sobrante se colapsa
          // a escala 0 en vez de quedarse con la matriz del tile anterior.
          if (!f) {
            dummy.position.set(0, 0, 0);
            dummy.quaternion.identity();
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            stemMesh.setMatrixAt(i, dummy.matrix);
            headMesh.setMatrixAt(i, dummy.matrix);
            continue;
          }

          baseEuler.set(f.tiltX, f.rotationY, f.tiltZ);
          baseQuat.setFromEuler(baseEuler);

          const stemWind = Math.sin(t * f.speed + f.phase) * 0.07;
          stemWindQuat.setFromAxisAngle(stemWindAxis, stemWind);
          finalStemQuat.copy(stemWindQuat).multiply(baseQuat);

          // Coordenadas LOCALES al tile: nunca se les suma `tileWorldZ` aquí
          // — el avance por scroll lo aporta el `<group>` contenedor.
          dummy.position.set(f.x, 0, f.z);
          dummy.quaternion.copy(finalStemQuat);
          dummy.scale.set(f.scaleXZ, f.scaleY, f.scaleXZ);
          dummy.updateMatrix();
          stemMesh.setMatrixAt(i, dummy.matrix);

          // La punta se escala por eje igual que el tallo (scaleXZ, scaleY,
          // scaleXZ) ANTES de rotar con la orientación de la planta.
          topOffset.set(tip.x * f.scaleXZ, tip.y * f.scaleY, tip.z * f.scaleXZ).applyQuaternion(finalStemQuat);

          const headWind = Math.sin(t * f.headSpeed + f.headPhase) * 0.05;
          headWindQuat.setFromAxisAngle(headWindAxis, headWind);
          // La cabeza hereda además la inclinación acumulada de la curva del
          // tallo, así que "cabecea" siguiéndolo en vez de quedar recta.
          finalHeadQuat.copy(headWindQuat).multiply(finalStemQuat).multiply(tipQuat);

          dummy.position.set(f.x + topOffset.x, topOffset.y, f.z + topOffset.z);
          dummy.quaternion.copy(finalHeadQuat);
          dummy.scale.set(f.scaleXZ, f.scaleXZ, f.scaleXZ);
          dummy.updateMatrix();
          headMesh.setMatrixAt(i, dummy.matrix);

          if (colorsChanged) {
            scratchColor.copy(headTintA).lerp(headTintB, f.tint);
            headMesh.setColorAt(i, scratchColor);
            scratchColor.copy(stemTintA).lerp(stemTintB, f.tint);
            stemMesh.setColorAt(i, scratchColor);
          }
        }

        // Marcar `needsUpdate` reenvía el buffer de matrices de ESTE slot a
        // la GPU, así que solo se hace cuando de verdad se reescribió algo.
        if (WIND_BY_TIER[variantTier(key)] || recycled[slot] || isFirstFrame) {
          stemMesh.instanceMatrix.needsUpdate = true;
          headMesh.instanceMatrix.needsUpdate = true;
        }
        if (colorsChanged) {
          if (stemMesh.instanceColor) stemMesh.instanceColor.needsUpdate = true;
          if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
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
          {SUNFLOWER_VARIANT_KEYS.filter((key) => variantCounts[key] > 0).map((key) => {
            const shadows = CASTS_SHADOW_BY_TIER[variantTier(key)];
            return (
              <group key={key}>
                <instancedMesh
                  ref={(el) => {
                    (stemRefs.current[key] ??= [])[slot] = el;
                  }}
                  args={[geometries[key].stem, undefined, variantCounts[key]]}
                  castShadow={shadows}
                  receiveShadow={shadows}
                  frustumCulled={false}
                >
                  {/* Doble cara obligatoria: las hojas son tiras de un solo
                      plano, así que sin esto las que quedaban de espaldas a
                      la luz o a la cámara desaparecían y la planta se veía
                      medio pelada. */}
                  <meshStandardMaterial vertexColors roughness={0.85} side={THREE.DoubleSide} />
                </instancedMesh>
                <instancedMesh
                  ref={(el) => {
                    (headRefs.current[key] ??= [])[slot] = el;
                  }}
                  args={[geometries[key].head, undefined, variantCounts[key]]}
                  castShadow={shadows}
                  receiveShadow={shadows}
                  frustumCulled={false}
                >
                  <meshStandardMaterial vertexColors roughness={0.8} side={THREE.DoubleSide} />
                </instancedMesh>
              </group>
            );
          })}
        </group>
      ))}
    </>
  );
}
