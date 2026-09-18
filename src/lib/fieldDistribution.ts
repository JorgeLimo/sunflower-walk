import { randomBetween, clamp } from './random';
import { TILE_LENGTH } from './constants';

/**
 * Primitivas de distribución compartidas por todos los sistemas de plantas
 * del campo (girasoles en `generateTileFlowers.ts`, lirios en
 * `generateTileLilies.ts`): agrupar en clusters chicos con tope de tamaño,
 * dejar una fracción suelta, y garantizar una separación mínima real vía una
 * rejilla espacial. Extraído de lo que antes vivía solo dentro de
 * `generateTileFlowers.ts` para no reescribir esta lógica cada vez que se
 * agrega una especie de planta nueva al campo.
 */

export interface SpatialBand {
  xMin: number;
  xMax: number;
  /** Distancia mínima entre dos plantas de esta franja. */
  minDist: number;
}

/**
 * Modulación de densidad a gran escala, en coordenadas de MUNDO (no locales
 * al tile) para que no se corte en las costuras entre segmentos: tramos más
 * poblados y tramos más abiertos, con longitudes de onda largas para que se
 * perciba caminando, no de golpe. `phase`/`freqScale` permiten que distintas
 * especies tengan sus propios tramos "flojos" en vez de coincidir siempre
 * con los mismos huecos de las demás.
 */
export function fieldDensityAt(worldZ: number, floor = 0.78, phase = 0, freqScale = 1): number {
  const wave =
    Math.sin(worldZ * 0.035 * freqScale + phase) * 0.5 + Math.sin(worldZ * 0.011 * freqScale + 2.1 + phase) * 0.5;
  return floor + (1 - floor) * (wave * 0.5 + 0.5);
}

export interface Cluster {
  side: number;
  x: number;
  z: number;
  spread: number;
  weight: number;
  /** Cuántas plantas puede recibir este grupo como máximo — la mayoría son
   * de 1-2, y solo ocasionalmente 3, para que nunca aparezcan bultos de
   * varias plantas prácticamente pegadas. */
  capacity: number;
  count: number;
}

/**
 * Rejilla espacial para la comprobación de distancia mínima. Con cientos o
 * miles de plantas por tile, comparar cada candidata contra TODAS las ya
 * colocadas se vuelve cuadrático y provoca un tirón al reciclar un
 * segmento; con celdas del tamaño de `minDist` basta con mirar las 9 celdas
 * vecinas.
 */
export interface PlacedGrid {
  cell: number;
  buckets: Map<string, { x: number; z: number }[]>;
}

export function createPlacedGrid(minDist: number): PlacedGrid {
  return { cell: Math.max(minDist, 0.05), buckets: new Map() };
}

export function gridHasNeighbor(grid: PlacedGrid, x: number, z: number, minDistSq: number): boolean {
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

export function gridAdd(grid: PlacedGrid, point: { x: number; z: number }) {
  const key = `${Math.floor(point.x / grid.cell)},${Math.floor(point.z / grid.cell)}`;
  const bucket = grid.buckets.get(key);
  if (bucket) bucket.push(point);
  else grid.buckets.set(key, [point]);
}

export function wrapZ(rawZ: number): number {
  return (((rawZ + TILE_LENGTH / 2) % TILE_LENGTH) + TILE_LENGTH) % TILE_LENGTH - TILE_LENGTH / 2;
}

export function buildClusters(
  random: () => number,
  targetCount: number,
  band: SpatialBand,
  worldZBase: number,
  density: (worldZ: number) => number,
): Cluster[] {
  const clusters: Cluster[] = [];
  const minGap = TILE_LENGTH / Math.max(targetCount * 2.4, 2);
  let attempts = 0;

  while (clusters.length < targetCount && attempts < targetCount * 12) {
    attempts++;
    const candidateZ = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
    if (random() > density(worldZBase + candidateZ)) continue;
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
export function pickAvailableCluster(random: () => number, clusters: Cluster[]): Cluster {
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

/** Círculo del que las plantas deben mantenerse afuera — se usa para que
 * ninguna quede clavada encima de una personita motivadora ni atravesando
 * su cartel (ver `greeterExclusionZones` en generateTileGreeters.ts). */
export interface ExclusionZone {
  x: number;
  z: number;
  radius: number;
}

function insideExclusion(x: number, z: number, exclusions?: ExclusionZone[]): boolean {
  if (!exclusions || exclusions.length === 0) return false;
  for (const zone of exclusions) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    if (dx * dx + dz * dz < zone.radius * zone.radius) return true;
  }
  return false;
}

/** Genera un candidato (x,z) repetidas veces hasta que quede a al menos
 * `minDist` de todos los ya colocados y fuera de cualquier `exclusions`
 * (o se agoten los intentos, para no quedarse atascado). Registra el
 * resultado en la rejilla antes de devolverlo. Si se agotan los intentos,
 * devuelve `null` — vale más un hueco de césped que dos plantas encimadas
 * o una planta atravesando a una personita. */
export function placeWithMinDistance(
  maxAttempts: number,
  minDist: number,
  grid: PlacedGrid,
  generate: () => { x: number; z: number },
  exclusions?: ExclusionZone[],
): { x: number; z: number } | null {
  const minDistSq = minDist * minDist;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generate();
    if (gridHasNeighbor(grid, candidate.x, candidate.z, minDistSq)) continue;
    if (insideExclusion(candidate.x, candidate.z, exclusions)) continue;
    gridAdd(grid, candidate);
    return candidate;
  }
  return null;
}

/** Coloca `count` plantas en una franja: la mayoría en grupos chicos (1-2,
 * a veces 3) y una fracción como plantas sueltas, respetando `minDist` vía
 * la rejilla compartida. Nada de grilla, nada de espaciado regular. */
export function scatterInBand(
  random: () => number,
  count: number,
  band: SpatialBand,
  grid: PlacedGrid,
  worldZBase: number,
  isolatedRatio: number,
  density: (worldZ: number) => number,
  place: (x: number, z: number) => void,
  exclusions?: ExclusionZone[],
) {
  if (count === 0) return;

  const isolatedCount = Math.round(count * isolatedRatio);
  const clusteredCount = count - isolatedCount;

  if (clusteredCount > 0) {
    // Tamaño de grupo promedio ~1.6-2.4 plantas, coherente con el tope de
    // `capacity`: casi todo individuo o pareja, pocas veces trío.
    const avgClusterSize = randomBetween(random, 1.6, 2.4);
    const targetClusterCount = Math.max(1, Math.round(clusteredCount / avgClusterSize));
    const clusters = buildClusters(random, targetClusterCount, band, worldZBase, density);

    for (let i = 0; i < clusteredCount; i++) {
      const cluster = pickAvailableCluster(random, clusters);
      const spot = placeWithMinDistance(
        16,
        band.minDist,
        grid,
        () => {
          const jitterX = (random() + random() - 1) * cluster.spread * 0.5;
          const absX = clamp(Math.abs(cluster.x + jitterX), band.xMin, band.xMax);
          const cx = cluster.side * absX;
          const cz = wrapZ(cluster.z + (random() + random() - 1) * cluster.spread);
          return { x: cx, z: cz };
        },
        exclusions,
      );
      if (!spot) continue;
      cluster.count++;
      place(spot.x, spot.z);
    }
  }

  for (let i = 0; i < isolatedCount; i++) {
    const spot = placeWithMinDistance(
      16,
      band.minDist,
      grid,
      () => {
        const side = random() < 0.5 ? -1 : 1;
        const cx = side * randomBetween(random, band.xMin, band.xMax);
        const cz = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
        return { x: cx, z: cz };
      },
      exclusions,
    );
    if (!spot) continue;
    place(spot.x, spot.z);
  }
}
