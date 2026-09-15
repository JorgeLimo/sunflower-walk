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
  /** Distancia mínima entre dos girasoles de esta franja, para que nunca
   * queden dos prácticamente en el mismo lugar. Más grande en primer plano
   * (plantas más grandes y cercanas) que en el fondo. Calibrada contra el
   * radio visual real de la copa de pétalos (~0.8 * scaleXZ para una planta
   * madura, ver sunflowerGeometry.ts) — los valores anteriores eran más
   * chicos que el propio ancho de la flor, así que aunque se respetaran al
   * pie de la letra igual se veían 4-5 girasoles fundidos en un solo bulto. */
  minDist: number;
}

const BAND_DEFS: Record<SunflowerTier, Band> = {
  foreground: {
    xMin: ROAD_WIDTH / 2 + 0.25,
    xMax: ROAD_WIDTH / 2 + 2.2,
    scaleMin: 1.15,
    scaleMax: 1.7,
    heightMin: 1.1,
    heightMax: 1.6,
    minDist: 1.3,
  },
  mid: {
    xMin: ROAD_WIDTH / 2 + 2,
    xMax: ROAD_WIDTH / 2 + 14,
    scaleMin: 0.75,
    scaleMax: 1.15,
    heightMin: 0.8,
    heightMax: 1.2,
    minDist: 0.8,
  },
  background: {
    xMin: ROAD_WIDTH / 2 + 12,
    xMax: ROAD_WIDTH / 2 + 42,
    scaleMin: 0.5,
    scaleMax: 0.9,
    heightMin: 0.55,
    heightMax: 0.95,
    minDist: 0.45,
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
  /** Cuántas plantas puede recibir este grupo como máximo. La mayoría son
   * de 1-2 (girasol suelto o en pareja), y solo ocasionalmente 3 — nunca
   * más, para que no vuelvan a aparecer bultos de 4-5 flores pegadas. */
  capacity: number;
  count: number;
}

/** Fracción de plantas que se colocan sueltas, ignorando los clusters por
 * completo — girasoles completamente aislados en medio del césped. Subida
 * desde 0.16 para que haya más individuos y más zonas abiertas entre
 * grupos, en vez de que casi todo pertenezca a algún cluster. */
const ISOLATED_RATIO = 0.24;

function buildClusters(random: () => number, targetCount: number, band: Band): Cluster[] {
  const clusters: Cluster[] = [];
  // Más separación entre CENTROS de cluster que antes (1.7 → 2.4), para
  // que queden huecos de césped claramente visibles entre un grupo y el
  // siguiente en vez de que se toquen.
  const minGap = TILE_LENGTH / Math.max(targetCount * 2.4, 2);
  let attempts = 0;

  while (clusters.length < targetCount && attempts < targetCount * 10) {
    attempts++;
    const candidateZ = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
    if (clusters.some((c) => Math.abs(c.z - candidateZ) < minGap)) continue;
    // La mayoría de los grupos son de 1-2 plantas; los de 3 son ocasionales
    // (~15% de las veces) — nunca más grande que eso.
    const capacityRoll = random();
    const capacity = capacityRoll < 0.4 ? 1 : capacityRoll < 0.85 ? 2 : 3;
    clusters.push({
      side: random() < 0.5 ? -1 : 1,
      x: randomBetween(random, band.xMin, band.xMax),
      z: candidateZ,
      // El radio del grupo se deriva de `minDist` (antes era un rango fijo
      // independiente de la franja): así, sin importar cuán grandes sean
      // las plantas de esta banda, siempre hay lugar para que 2-3 de ellas
      // quepan dentro del grupo respetando la separación mínima entre sí,
      // en vez de terminar forzadas a superponerse tras agotar intentos.
      spread: randomBetween(random, band.minDist * 1.2, band.minDist * 2.6),
      // Distribución sesgada (pocos grupos grandes, la mayoría chicos) para
      // que la densidad del campo se sienta desigual, no repartida parejo.
      weight: Math.pow(random(), 1.6) + 0.1,
      capacity,
      count: 0,
    });
  }

  if (clusters.length === 0) {
    clusters.push({
      side: random() < 0.5 ? -1 : 1,
      x: randomBetween(random, band.xMin, band.xMax),
      z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
      spread: band.minDist * 1.8,
      weight: 1,
      capacity: 2,
      count: 0,
    });
  }

  return clusters;
}

/** Elige un cluster con espacio libre, con probabilidad proporcional a su
 * `weight` entre los que todavía no llegaron a su `capacity`. Si todos están
 * llenos (raro; solo con muy pocos clusters y mucho `clusteredCount`), cae
 * de nuevo a cualquiera para no bloquear la colocación. */
function pickAvailableCluster(random: () => number, clusters: Cluster[]): Cluster {
  let totalWeight = 0;
  for (const c of clusters) if (c.count < c.capacity) totalWeight += c.weight;

  if (totalWeight > 0) {
    let r = random() * totalWeight;
    for (const cluster of clusters) {
      if (cluster.count >= cluster.capacity) continue;
      if (r < cluster.weight) return cluster;
      r -= cluster.weight;
    }
  }
  return clusters[clusters.length - 1];
}

function wrapZ(rawZ: number): number {
  return (((rawZ + TILE_LENGTH / 2) % TILE_LENGTH) + TILE_LENGTH) % TILE_LENGTH - TILE_LENGTH / 2;
}

/** Genera un candidato (x,z) repetidas veces hasta que quede a al menos
 * `minDist` de todos los ya colocados en `placed` (o se agoten los
 * intentos, para no arriesgar quedarse atascado) — así dos girasoles nunca
 * terminan prácticamente en el mismo lugar. Registra el resultado en
 * `placed` antes de devolverlo. */
function placeWithMinDistance(
  maxAttempts: number,
  minDist: number,
  placed: { x: number; z: number }[],
  generate: () => { x: number; z: number },
): { x: number; z: number } {
  const minDistSq = minDist * minDist;
  let candidate = generate();
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    const tooClose = placed.some((p) => {
      const dx = p.x - candidate.x;
      const dz = p.z - candidate.z;
      return dx * dx + dz * dz < minDistSq;
    });
    if (!tooClose) break;
    candidate = generate();
  }
  placed.push(candidate);
  return candidate;
}

/**
 * Distribuye `count` girasoles de una franja en un tile: la mayoría en unos
 * pocos clusters de tamaño desigual (con separación mínima entre ellos para
 * que queden huecos de césped visibles), y una fracción como plantas
 * sueltas totalmente independientes. Nada de grilla, nada de espaciado
 * regular: cada llamada usa el mismo `random` seedeado del tile, así que el
 * resultado es distinto por tile pero estable si se regenera.
 */
function fillFlowers(
  random: () => number,
  count: number,
  band: Band,
  maturity: SunflowerMaturity,
  placed: { x: number; z: number }[],
): FlowerLocal[] {
  const out: FlowerLocal[] = [];
  if (count === 0) return out;

  const isolatedCount = Math.round(count * ISOLATED_RATIO);
  const clusteredCount = count - isolatedCount;
  const maturityScale = maturity === 'young' ? 0.72 : 1;

  const place = (x: number, z: number) => {
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
    // Tamaño de cluster promedio ~1.6-2.4 plantas (coherente con el tope de
    // `capacity` en buildClusters: casi todo pareja o individuo, pocas
    // veces trío) — antes esto apuntaba a 3-6 plantas por cluster, que es
    // justamente lo que producía los bultos de 4-5 girasoles pegados.
    const avgClusterSize = randomBetween(random, 1.6, 2.4);
    const targetClusterCount = Math.max(1, Math.round(clusteredCount / avgClusterSize));
    const clusters = buildClusters(random, targetClusterCount, band);

    for (let i = 0; i < clusteredCount; i++) {
      const cluster = pickAvailableCluster(random, clusters);
      cluster.count++;
      // Más intentos que antes (6 → 12) para que `minDist` se respete de
      // verdad en vez de rendirse rápido y dejar dos flores superpuestas.
      const { x, z } = placeWithMinDistance(12, band.minDist, placed, () => {
        const jitterX = (random() + random() - 1) * cluster.spread * 0.45;
        const absX = clamp(Math.abs(cluster.x + jitterX), band.xMin, band.xMax);
        const cx = cluster.side * absX;
        const cz = wrapZ(cluster.z + (random() + random() - 1) * cluster.spread);
        return { x: cx, z: cz };
      });
      place(x, z);
    }
  }

  for (let i = 0; i < isolatedCount; i++) {
    const { x, z } = placeWithMinDistance(12, band.minDist, placed, () => {
      const side = random() < 0.5 ? -1 : 1;
      const cx = side * randomBetween(random, band.xMin, band.xMax);
      const cz = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
      return { x: cx, z: cz };
    });
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
    // Un único registro de posiciones compartido entre maduros y jóvenes
    // de la MISMA franja, para que tampoco terminen superpuestos entre sí.
    const placed: { x: number; z: number }[] = [];
    result[`${tier}-mature`] = fillFlowers(random, variantCounts[`${tier}-mature`], band, 'mature', placed);
    result[`${tier}-young`] = fillFlowers(random, variantCounts[`${tier}-young`], band, 'young', placed);
  });

  return result;
}
