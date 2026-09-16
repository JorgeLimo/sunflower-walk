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

interface Band {
  xMin: number;
  xMax: number;
  scaleMin: number;
  scaleMax: number;
  heightMin: number;
  heightMax: number;
  /** Distancia mínima entre dos girasoles de esta franja. Bajó junto con la
   * escala de las plantas: cabezas más chicas admiten más densidad sin que se
   * vean fundidas unas con otras. */
  minDist: number;
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
    xMin: ROAD_WIDTH / 2 + 0.3,
    xMax: ROAD_WIDTH / 2 + 4.6,
    scaleMin: 0.3,
    scaleMax: 0.45,
    heightMin: 0.4,
    heightMax: 0.54,
    minDist: 0.62,
  },
  mid: {
    xMin: ROAD_WIDTH / 2 + 2.6,
    xMax: ROAD_WIDTH / 2 + 20,
    scaleMin: 0.25,
    scaleMax: 0.38,
    heightMin: 0.34,
    heightMax: 0.48,
    minDist: 0.48,
  },
  background: {
    xMin: ROAD_WIDTH / 2 + 17,
    xMax: ROAD_WIDTH / 2 + 112,
    scaleMin: 0.18,
    scaleMax: 0.3,
    heightMin: 0.26,
    heightMax: 0.4,
    minDist: 0.34,
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

interface Cluster {
  side: number;
  x: number;
  z: number;
  spread: number;
  weight: number;
  /** Cuántas plantas puede recibir este grupo como máximo. La mayoría son
   * de 1-2 (girasol suelto o en pareja), y solo ocasionalmente 3 — nunca
   * más, para que no aparezcan bultos de 4-5 flores pegadas. */
  capacity: number;
  count: number;
}

/** Fracción de plantas que se colocan sueltas, ignorando los clusters por
 * completo — girasoles completamente aislados en medio del césped. */
const ISOLATED_RATIO = 0.26;

/**
 * Modulación de densidad a gran escala, en coordenadas de MUNDO (no locales
 * al tile) para que no se corte en las costuras entre segmentos: el campo
 * tiene tramos más poblados y tramos más abiertos, con longitudes de onda
 * largas (~180 y ~570 unidades) para que se perciba caminando, no de golpe.
 */
function fieldDensityAt(worldZ: number): number {
  const wave = Math.sin(worldZ * 0.035) * 0.5 + Math.sin(worldZ * 0.011 + 2.1) * 0.5;
  return 0.45 + 0.55 * (wave * 0.5 + 0.5);
}

/**
 * Rejilla espacial para la comprobación de distancia mínima. Con cientos de
 * plantas por tile, comparar cada candidata contra TODAS las ya colocadas se
 * volvía cuadrático y provocaba un tirón al reciclar un segmento; con celdas
 * del tamaño de `minDist` basta con mirar las 9 celdas vecinas.
 */
interface PlacedGrid {
  cell: number;
  buckets: Map<string, { x: number; z: number }[]>;
}

function createPlacedGrid(minDist: number): PlacedGrid {
  return { cell: Math.max(minDist, 0.05), buckets: new Map() };
}

function gridHasNeighbor(grid: PlacedGrid, x: number, z: number, minDistSq: number): boolean {
  const cx = Math.floor(x / grid.cell);
  const cz = Math.floor(z / grid.cell);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const bucket = grid.buckets.get(`${cx + i},${cz + j}`);
      if (!bucket) continue;
      for (const p of bucket) {
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < minDistSq) return true;
      }
    }
  }
  return false;
}

function gridAdd(grid: PlacedGrid, point: { x: number; z: number }) {
  const key = `${Math.floor(point.x / grid.cell)},${Math.floor(point.z / grid.cell)}`;
  const bucket = grid.buckets.get(key);
  if (bucket) bucket.push(point);
  else grid.buckets.set(key, [point]);
}

function buildClusters(random: () => number, targetCount: number, band: Band, worldZBase: number): Cluster[] {
  const clusters: Cluster[] = [];
  const minGap = TILE_LENGTH / Math.max(targetCount * 2.4, 2);
  let attempts = 0;

  while (clusters.length < targetCount && attempts < targetCount * 12) {
    attempts++;
    const candidateZ = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
    // Tramos más densos y tramos más abiertos (ver fieldDensityAt).
    if (random() > fieldDensityAt(worldZBase + candidateZ)) continue;
    if (clusters.some((c) => Math.abs(c.z - candidateZ) < minGap)) continue;
    // La mayoría de los grupos son de 1-2 plantas; los de 3 son ocasionales.
    const capacityRoll = random();
    const capacity = capacityRoll < 0.42 ? 1 : capacityRoll < 0.86 ? 2 : 3;
    clusters.push({
      side: random() < 0.5 ? -1 : 1,
      x: randomBetween(random, band.xMin, band.xMax),
      z: candidateZ,
      // El radio del grupo se deriva de `minDist`: así, sin importar cuán
      // grandes sean las plantas de esta banda, siempre hay lugar para que
      // 2-3 de ellas quepan respetando la separación mínima entre sí.
      spread: randomBetween(random, band.minDist * 1.3, band.minDist * 3),
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
 * `weight` entre los que todavía no llegaron a su `capacity`. */
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
 * `minDist` de todos los ya colocados (o se agoten los intentos, para no
 * quedarse atascado). Registra el resultado en la rejilla antes de devolverlo. */
function placeWithMinDistance(
  maxAttempts: number,
  minDist: number,
  grid: PlacedGrid,
  generate: () => { x: number; z: number },
): { x: number; z: number } | null {
  const minDistSq = minDist * minDist;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generate();
    if (!gridHasNeighbor(grid, candidate.x, candidate.z, minDistSq)) {
      gridAdd(grid, candidate);
      return candidate;
    }
  }
  // Antes, al agotar los intentos se colocaba igual la última candidata, que
  // es justo lo que producía plantas superpuestas. Ahora se descarta: vale
  // más un hueco de césped que dos girasoles encimados.
  return null;
}

/**
 * Distribuye `count` girasoles de una franja en un tile: la mayoría en grupos
 * chicos (1-2 plantas, a veces 3) y una buena fracción como plantas sueltas.
 * Nada de grilla, nada de espaciado regular: cada llamada usa el mismo
 * `random` seedeado del tile, así que el resultado es distinto por tile pero
 * estable si se regenera.
 */
function fillFlowers(
  random: () => number,
  count: number,
  band: Band,
  maturity: SunflowerMaturity,
  grid: PlacedGrid,
  worldZBase: number,
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
  };

  if (clusteredCount > 0) {
    // Tamaño de grupo promedio ~1.6-2.4 plantas, coherente con el tope de
    // `capacity`: casi todo individuo o pareja, pocas veces trío.
    const avgClusterSize = randomBetween(random, 1.6, 2.4);
    const targetClusterCount = Math.max(1, Math.round(clusteredCount / avgClusterSize));
    const clusters = buildClusters(random, targetClusterCount, band, worldZBase);

    for (let i = 0; i < clusteredCount; i++) {
      const cluster = pickAvailableCluster(random, clusters);
      const spot = placeWithMinDistance(16, band.minDist, grid, () => {
        const jitterX = (random() + random() - 1) * cluster.spread * 0.5;
        const absX = clamp(Math.abs(cluster.x + jitterX), band.xMin, band.xMax);
        const cx = cluster.side * absX;
        const cz = wrapZ(cluster.z + (random() + random() - 1) * cluster.spread);
        return { x: cx, z: cz };
      });
      if (!spot) continue;
      cluster.count++;
      place(spot.x, spot.z);
    }
  }

  for (let i = 0; i < isolatedCount; i++) {
    const spot = placeWithMinDistance(16, band.minDist, grid, () => {
      const side = random() < 0.5 ? -1 : 1;
      const cx = side * randomBetween(random, band.xMin, band.xMax);
      const cz = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
      return { x: cx, z: cz };
    });
    if (!spot) continue;
    place(spot.x, spot.z);
  }

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

  TIERS.forEach((tier) => {
    const band = BAND_DEFS[tier];
    MATURITIES.forEach((maturity) => {
      STYLES.forEach((style) => {
        const key: SunflowerVariantKey = `${tier}-${maturity}-${style}`;
        result[key] = fillFlowers(random, variantCounts[key], band, maturity, grid, worldZBase);
      });
    });
  });

  return result;
}
