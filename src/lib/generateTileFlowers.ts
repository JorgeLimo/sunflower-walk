import { createSeededRandom, randomBetween } from './random';
import { ROAD_WIDTH, TILE_LENGTH } from './constants';
import type { SunflowerTierCounts } from './viewport';
import type { SunflowerMaturity } from './sunflowerGeometry';
import {
  fieldDensityAt,
  createPlacedGrid,
  scatterInBand,
  type SpatialBand,
  type PlacedGrid,
  type ExclusionZone,
} from './fieldDistribution';
import { greeterExclusionZonesForTile } from './generateTileGreeters';

export interface FlowerLocal {
  x: number;
  z: number;
  rotationY: number;
  tiltX: number;
  tiltZ: number;
  scaleXZ: number;
  scaleY: number;
  phase: number;
  speed: number;
  headPhase: number;
  headSpeed: number;
  /** 0..1: variación cálido/limón por planta, aplicada como tinte de
   * instancia (ver Sunflowers.tsx) para que no todas las flores compartan
   * exactamente el mismo tono aunque compartan geometría. */
  tint: number;
}

export type SunflowerTier = 'foreground' | 'mid' | 'background';
/** Dos geometrías distintas por franja+madurez. Cada estilo se construye con
 * una semilla propia (ver SEED_BY_VARIANT), y como la cantidad de pétalos y
 * la disposición de hojas dependen de esa semilla, dos plantas vecinas de la
 * misma franja ya no comparten silueta. */
export type SunflowerStyle = 'a' | 'b';
export type SunflowerVariantKey = `${SunflowerTier}-${SunflowerMaturity}-${SunflowerStyle}`;

const TIERS: SunflowerTier[] = ['foreground', 'mid', 'background'];
const MATURITIES: SunflowerMaturity[] = ['mature', 'young'];
const STYLES: SunflowerStyle[] = ['a', 'b'];

export const SUNFLOWER_VARIANT_KEYS: SunflowerVariantKey[] = TIERS.flatMap((tier) =>
  MATURITIES.flatMap((maturity) => STYLES.map((style) => `${tier}-${maturity}-${style}` as SunflowerVariantKey)),
);

/** Proporción de plantas jóvenes (más pequeñas y de brote cerrado) por franja. */
const YOUNG_RATIO = 0.2;

interface Band extends SpatialBand {
  scaleMin: number;
  scaleMax: number;
  heightMin: number;
  heightMax: number;
}

// Las tres franjas son LATERALES (distancia al camino), no de profundidad: la
// profundidad la da el sistema de tiles, que reparte plantas a lo largo de
// ~190 unidades hacia adelante. Por eso la franja de fondo llega tan lejos en
// X: a 150 unidades de distancia el encuadre abarca casi ±100 unidades, y si
// las flores terminaban en ±44 se veía una franja de césped pelado a ambos
// lados del horizonte.
//
// Escalas calibradas contra la altura de la persona (~1.64 de alto): con
// `STEM_HEIGHT_BY_MATURITY.mature` = 1.6, la planta de primer plano más alta
// mide 1.6 * 0.54 = 0.86, o sea algo más de la MITAD de la persona, y la
// media del rango queda bastante por debajo. Las franjas más lejanas bajan
// de ahí, así que el tamaño acompaña a la distancia. `minDist` bajó en la
// misma proporción que las plantas: copas más chicas admiten mucha más
// densidad conservando césped visible entre medias.
const BAND_DEFS: Record<SunflowerTier, Band> = {
  foreground: {
    // Casi pegada al borde del camino: era la franja donde más se notaba el
    // césped pelado, porque la banda arrancaba a 0.3 del borde y en primer
    // plano la perspectiva ensancha mucho ese hueco.
    xMin: ROAD_WIDTH / 2 + 0.12,
    xMax: ROAD_WIDTH / 2 + 5.2,
    scaleMin: 0.3,
    scaleMax: 0.45,
    heightMin: 0.4,
    heightMax: 0.54,
    minDist: 0.38,
  },
  mid: {
    xMin: ROAD_WIDTH / 2 + 2.6,
    xMax: ROAD_WIDTH / 2 + 20,
    scaleMin: 0.25,
    scaleMax: 0.38,
    heightMin: 0.34,
    heightMax: 0.48,
    minDist: 0.31,
  },
  background: {
    xMin: ROAD_WIDTH / 2 + 17,
    xMax: ROAD_WIDTH / 2 + 112,
    scaleMin: 0.18,
    scaleMax: 0.3,
    heightMin: 0.26,
    heightMax: 0.4,
    minDist: 0.24,
  },
};

/** Cuántas plantas de cada variante (franja x madurez x estilo) le tocan a
 * cada tile. Es una función pura de `counts`, así que el tamaño de cada
 * InstancedMesh puede fijarse de antemano sin desperdiciar instancias. */
export function computeVariantCounts(counts: SunflowerTierCounts): Record<SunflowerVariantKey, number> {
  const result = {} as Record<SunflowerVariantKey, number>;
  TIERS.forEach((tier) => {
    const total = counts[tier];
    const young = Math.round(total * YOUNG_RATIO);
    const byMaturity: Record<SunflowerMaturity, number> = { young, mature: total - young };
    MATURITIES.forEach((maturity) => {
      const n = byMaturity[maturity];
      const styleA = Math.ceil(n / 2);
      result[`${tier}-${maturity}-a`] = styleA;
      result[`${tier}-${maturity}-b`] = n - styleA;
    });
  });
  return result;
}

/** Fracción de plantas que se colocan sueltas, ignorando los clusters por
 * completo — girasoles completamente aislados en medio del césped. */
const ISOLATED_RATIO = 0.36;

/**
 * Distribuye `count` girasoles de una franja en un tile reutilizando
 * `scatterInBand` (mismas reglas de cluster/aislado/separación mínima que
 * cualquier otra especie del campo — ver `fieldDistribution.ts`).
 */
function fillFlowers(
  random: () => number,
  count: number,
  band: Band,
  maturity: SunflowerMaturity,
  grid: PlacedGrid,
  worldZBase: number,
  exclusions: ExclusionZone[],
): FlowerLocal[] {
  const out: FlowerLocal[] = [];
  const maturityScale = maturity === 'young' ? 0.72 : 1;

  scatterInBand(
    random,
    count,
    band,
    grid,
    worldZBase,
    ISOLATED_RATIO,
    // Piso alto: casi sin tramos "flojos", para que no queden parches
    // grandes de césped pelado entre manchones.
    (worldZ) => fieldDensityAt(worldZ, 0.92),
    (x, z) => {
      out.push({
        x,
        z,
        rotationY: random() * Math.PI * 2,
        tiltX: randomBetween(random, -0.2, 0.2),
        tiltZ: randomBetween(random, -0.2, 0.2),
        scaleXZ: randomBetween(random, band.scaleMin, band.scaleMax) * maturityScale,
        scaleY: randomBetween(random, band.heightMin, band.heightMax) * maturityScale,
        phase: random() * Math.PI * 2,
        speed: randomBetween(random, 0.7, 1.3),
        headPhase: random() * Math.PI * 2,
        headSpeed: randomBetween(random, 0.8, 1.4),
        tint: random(),
      });
    },
    exclusions,
  );

  return out;
}

/**
 * Genera los girasoles locales de UN segmento del camino, agrupados por
 * variante (franja x madurez x estilo). Determinístico por `index`, así que
 * el mismo segmento siempre se ve igual si se regenera.
 */
export function generateTileFlowers(index: number, counts: SunflowerTierCounts): Record<SunflowerVariantKey, FlowerLocal[]> {
  const random = createSeededRandom(index * 7919 + 101);
  const variantCounts = computeVariantCounts(counts);
  const result = {} as Record<SunflowerVariantKey, FlowerLocal[]>;
  const worldZBase = index * TILE_LENGTH;

  // UNA sola rejilla para todo el tile, no una por franja: las bandas se
  // solapan en X (la de primer plano llega a 4.6 y la media arranca en 2.6),
  // así que con rejillas separadas una planta de primer plano y una de la
  // franja media podían acabar exactamente en el mismo sitio, que es de
  // donde salían los grupos de flores encimadas.
  const grid = createPlacedGrid(Math.max(...TIERS.map((t) => BAND_DEFS[t].minDist)));
  // Ningún girasol debe crecer encima de una personita ni atravesar su
  // cartel — ver `greeterExclusionZonesForTile`. Mismo `index`, así que
  // esto nunca se desincroniza de dónde termina realmente cada personita.
  const exclusions = greeterExclusionZonesForTile(index);

  TIERS.forEach((tier) => {
    const band = BAND_DEFS[tier];
    MATURITIES.forEach((maturity) => {
      STYLES.forEach((style) => {
        const key: SunflowerVariantKey = `${tier}-${maturity}-${style}`;
        result[key] = fillFlowers(random, variantCounts[key], band, maturity, grid, worldZBase, exclusions);
      });
    });
  });

  return result;
}
