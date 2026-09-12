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

interface Cluster {
  side: number;
  x: number;
  z: number;
  spread: number;
  weight: number;
}

/** Fracción de plantas que se colocan sueltas, ignorando los clusters por
 * completo — girasoles completamente aislados en medio del césped. */
const ISOLATED_RATIO = 0.16;

function buildClusters(random: () => number, targetCount: number, band: Band): Cluster[] {
  const clusters: Cluster[] = [];
  const minGap = TILE_LENGTH / Math.max(targetCount * 1.7, 2);
  let attempts = 0;

  while (clusters.length < targetCount && attempts < targetCount * 10) {
    attempts++;
    const candidateZ = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
    if (clusters.some((c) => Math.abs(c.z - candidateZ) < minGap)) continue;
    clusters.push({
      side: random() < 0.5 ? -1 : 1,
      x: randomBetween(random, band.xMin, band.xMax),
      z: candidateZ,
      // Radios muy dispares a propósito: unos pocos "hubs" apretados y
      // varios grupos sueltos y pequeños, en vez de clusters todos iguales.
      spread: randomBetween(random, 0.45, 2.3),
      // Distribución sesgada (pocos grupos grandes, la mayoría chicos) para
      // que la densidad del campo se sienta desigual, no repartida parejo.
      weight: Math.pow(random(), 2.2) + 0.1,
    });
  }

  if (clusters.length === 0) {
    clusters.push({
      side: random() < 0.5 ? -1 : 1,
      x: randomBetween(random, band.xMin, band.xMax),
      z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
      spread: 1.4,
      weight: 1,
    });
  }

  return clusters;
}

function pickWeighted(random: () => number, clusters: Cluster[], totalWeight: number): Cluster {
  let r = random() * totalWeight;
  for (const cluster of clusters) {
    if (r < cluster.weight) return cluster;
    r -= cluster.weight;
  }
  return clusters[clusters.length - 1];
}

/**
 * Distribuye `count` girasoles de una franja en un tile: la mayoría en unos
 * pocos clusters de tamaño desigual (con separación mínima entre ellos para
 * que queden huecos de césped visibles), y una fracción como plantas
 * sueltas totalmente independientes. Nada de grilla, nada de espaciado
 * regular: cada llamada usa el mismo `random` seedeado del tile, así que el
 * resultado es distinto por tile pero estable si se regenera.
 */
function fillFlowers(random: () => number, count: number, band: Band, maturity: SunflowerMaturity): FlowerLocal[] {
  const out: FlowerLocal[] = [];
  if (count === 0) return out;

  const isolatedCount = Math.round(count * ISOLATED_RATIO);
  const clusteredCount = count - isolatedCount;
  const maturityScale = maturity === 'young' ? 0.72 : 1;

  const place = (x: number, rawZ: number) => {
    const z = (((rawZ + TILE_LENGTH / 2) % TILE_LENGTH) + TILE_LENGTH) % TILE_LENGTH - TILE_LENGTH / 2;
    out.push({
      x,
      z,
      rotationY: random() * Math.PI * 2,
      tiltX: randomBetween(random, -0.16, 0.16),
      tiltZ: randomBetween(random, -0.16, 0.16),
      scaleXZ: randomBetween(random, band.scaleMin, band.scaleMax) * maturityScale,
      scaleY: randomBetween(random, band.heightMin, band.heightMax) * maturityScale,
      phase: random() * Math.PI * 2,
      speed: randomBetween(random, 0.7, 1.3),
      headPhase: random() * Math.PI * 2,
      headSpeed: randomBetween(random, 0.8, 1.4),
    });
  };

  if (clusteredCount > 0) {
    const targetClusterCount = Math.max(1, Math.round(randomBetween(random, clusteredCount / 6, clusteredCount / 3)));
    const clusters = buildClusters(random, targetClusterCount, band);
    const totalWeight = clusters.reduce((sum, c) => sum + c.weight, 0);

    for (let i = 0; i < clusteredCount; i++) {
      const cluster = pickWeighted(random, clusters, totalWeight);
      const jitterX = (random() + random() - 1) * cluster.spread * 0.45;
      const absX = clamp(Math.abs(cluster.x + jitterX), band.xMin, band.xMax);
      const x = cluster.side * absX;
      const z = cluster.z + (random() + random() - 1) * cluster.spread;
      place(x, z);
    }
  }

  for (let i = 0; i < isolatedCount; i++) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * randomBetween(random, band.xMin, band.xMax);
    const z = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
    place(x, z);
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
