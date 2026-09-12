import { createSeededRandom, randomBetween, clamp } from './random';
import { ROAD_WIDTH, TILE_LENGTH } from './constants';
import type { SunflowerTierCounts } from './viewport';
import type { SunflowerMaturity } from './sunflowerGeometry';

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
}

export type SunflowerTier = 'foreground' | 'mid' | 'background';
export type SunflowerVariantKey = `${SunflowerTier}-${SunflowerMaturity}`;

const TIERS: SunflowerTier[] = ['foreground', 'mid', 'background'];

export const SUNFLOWER_VARIANT_KEYS: SunflowerVariantKey[] = TIERS.flatMap(
  (tier) => [`${tier}-mature`, `${tier}-young`] as SunflowerVariantKey[],
);

/** Proporción de plantas jóvenes (más pequeñas y de brote cerrado) por franja. */
const YOUNG_RATIO = 0.2;

interface Band {
  xMin: number;
  xMax: number;
  scaleMin: number;
  scaleMax: number;
  heightMin: number;
  heightMax: number;
}

const BAND_DEFS: Record<SunflowerTier, Band> = {
  foreground: {
    xMin: ROAD_WIDTH / 2 + 0.25,
    xMax: ROAD_WIDTH / 2 + 2.2,
    scaleMin: 1.15,
    scaleMax: 1.7,
    heightMin: 1.1,
    heightMax: 1.6,
  },
  mid: {
    xMin: ROAD_WIDTH / 2 + 2,
    xMax: ROAD_WIDTH / 2 + 14,
    scaleMin: 0.75,
    scaleMax: 1.15,
    heightMin: 0.8,
    heightMax: 1.2,
  },
  background: {
    xMin: ROAD_WIDTH / 2 + 12,
    xMax: ROAD_WIDTH / 2 + 42,
    scaleMin: 0.5,
    scaleMax: 0.9,
    heightMin: 0.55,
    heightMax: 0.95,
  },
};

/** Cuántas plantas de cada variante (franja x madurez) le tocan a cada tile.
 * Es una función pura de `counts`, así que el tamaño de cada InstancedMesh
 * puede fijarse de antemano sin desperdiciar instancias. */
export function computeVariantCounts(counts: SunflowerTierCounts): Record<SunflowerVariantKey, number> {
  const result = {} as Record<SunflowerVariantKey, number>;
  TIERS.forEach((tier) => {
    const total = counts[tier];
    const young = Math.round(total * YOUNG_RATIO);
    result[`${tier}-young`] = young;
    result[`${tier}-mature`] = total - young;
  });
  return result;
}

function fillFlowers(random: () => number, count: number, band: Band, maturity: SunflowerMaturity): FlowerLocal[] {
  const out: FlowerLocal[] = [];
  if (count === 0) return out;

  // Agrupa las plantas en unos pocos "clusters" con dispersión propia en vez
  // de esparcirlas uniformemente: eso da zonas más pobladas y huecos
  // naturales en vez de un patrón parejo tipo grilla.
  const clusterCount = Math.max(1, Math.round(count / 4.5));
  const clusters = Array.from({ length: clusterCount }, () => ({
    side: random() < 0.5 ? -1 : 1,
    x: randomBetween(random, band.xMin, band.xMax),
    z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
    spread: randomBetween(random, 1.1, 3.4),
  }));

  const maturityScale = maturity === 'young' ? 0.72 : 1;

  for (let i = 0; i < count; i++) {
    const cluster = clusters[Math.floor(random() * clusters.length)];
    const jitterX = (random() + random() - 1) * cluster.spread * 0.4;
    const absX = clamp(Math.abs(cluster.x + jitterX), band.xMin, band.xMax);
    const x = cluster.side * absX;

    const rawZ = cluster.z + (random() + random() - 1) * cluster.spread;
    const z = (((rawZ + TILE_LENGTH / 2) % TILE_LENGTH) + TILE_LENGTH) % TILE_LENGTH - TILE_LENGTH / 2;

    out.push({
      x,
      z,
      rotationY: random() * Math.PI * 2,
      tiltX: randomBetween(random, -0.08, 0.08),
      tiltZ: randomBetween(random, -0.08, 0.08),
      scaleXZ: randomBetween(random, band.scaleMin, band.scaleMax) * maturityScale,
      scaleY: randomBetween(random, band.heightMin, band.heightMax) * maturityScale,
      phase: random() * Math.PI * 2,
      speed: randomBetween(random, 0.7, 1.3),
      headPhase: random() * Math.PI * 2,
      headSpeed: randomBetween(random, 0.8, 1.4),
    });
  }

  return out;
}

/**
 * Genera los girasoles locales de UN segmento del camino, agrupados por
 * variante (franja de profundidad x madurez). Determinístico por `index`,
 * así que el mismo segmento siempre se ve igual si se regenera.
 */
export function generateTileFlowers(index: number, counts: SunflowerTierCounts): Record<SunflowerVariantKey, FlowerLocal[]> {
  const random = createSeededRandom(index * 7919 + 101);
  const variantCounts = computeVariantCounts(counts);
  const result = {} as Record<SunflowerVariantKey, FlowerLocal[]>;

  TIERS.forEach((tier) => {
    const band = BAND_DEFS[tier];
    result[`${tier}-mature`] = fillFlowers(random, variantCounts[`${tier}-mature`], band, 'mature');
    result[`${tier}-young`] = fillFlowers(random, variantCounts[`${tier}-young`], band, 'young');
  });

  return result;
}
