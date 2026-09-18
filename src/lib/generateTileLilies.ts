import { createSeededRandom, randomBetween } from './random';
import { ROAD_WIDTH, TILE_LENGTH } from './constants';
import {
  fieldDensityAt,
  createPlacedGrid,
  scatterInBand,
  type SpatialBand,
  type ExclusionZone,
} from './fieldDistribution';
import { greeterExclusionZonesForTile } from './generateTileGreeters';
import type { LilyDetail } from './lilyGeometry';

export interface LilyLocal {
  x: number;
  z: number;
  rotationY: number;
  tiltX: number;
  tiltZ: number;
  scale: number;
  phase: number;
  speed: number;
  /** 0..1: variación crema/blanco puro por instancia, vía instanceColor
   * (mismo mecanismo que el tinte del girasol en Sunflowers.tsx). */
  tint: number;
}

export type LilyTier = LilyDetail; // 'near' | 'far'
export type LilyStyle = 'a' | 'b';
export type LilyVariantKey = `${LilyTier}-${LilyStyle}`;

const TIERS: LilyTier[] = ['near', 'far'];
const STYLES: LilyStyle[] = ['a', 'b'];

export const LILY_VARIANT_KEYS: LilyVariantKey[] = TIERS.flatMap((tier) =>
  STYLES.map((style) => `${tier}-${style}` as LilyVariantKey),
);

export interface LilyTierCounts {
  near: number;
  far: number;
}

interface Band extends SpatialBand {
  scaleMin: number;
  scaleMax: number;
}

// El lirio es una especie COMPLEMENTARIA: nunca debe leerse como protagonista
// del campo. Escala calibrada para quedar claramente por debajo de un
// girasol de la misma franja (ver BAND_DEFS en generateTileFlowers.ts) y muy
// por debajo de la protagonista (~1.64 de alto).
//
// Las bandas se solapan a propósito con el tramo donde el campo de girasoles
// se sentía más vacío al analizar la escena actual: justo la transición
// entre la franja cercana y la lejana (alrededor de las piedras/arbustos),
// donde el pasto quedaba liso sin nada que lo rompiera.
const BAND_DEFS: Record<LilyTier, Band> = {
  near: {
    xMin: ROAD_WIDTH / 2 + 0.8,
    xMax: ROAD_WIDTH / 2 + 9,
    scaleMin: 0.75,
    scaleMax: 1.05,
    minDist: 0.5,
  },
  far: {
    xMin: ROAD_WIDTH / 2 + 6.5,
    xMax: ROAD_WIDTH / 2 + 48,
    scaleMin: 0.55,
    scaleMax: 0.85,
    minDist: 0.35,
  },
};

// Más plantas sueltas que en el girasol (0.26): el pedido explícito es que
// haya "algunos lirios solos, algunos grupos de 2-3, evitando grandes
// concentraciones" — acá el suelto es la norma, el grupo la excepción grata.
const ISOLATED_RATIO = 0.42;

// Fase y frecuencia propias (distintas de las del girasol) para que los
// tramos más/menos poblados de lirios NO coincidan siempre con los de
// girasoles: a veces un lirio aparece justo donde el campo de girasoles
// está más flojo, ayudando a llenarlo; otras veces se solapan. Cualquiera
// de las dos lecturas se siente natural, ninguna se siente mecánica.
function lilyDensityAt(worldZ: number): number {
  return fieldDensityAt(worldZ, 0.62, 1.7, 0.8);
}

export function computeLilyVariantCounts(counts: LilyTierCounts): Record<LilyVariantKey, number> {
  const result = {} as Record<LilyVariantKey, number>;
  TIERS.forEach((tier) => {
    const total = counts[tier];
    const styleA = Math.ceil(total / 2);
    result[`${tier}-a`] = styleA;
    result[`${tier}-b`] = total - styleA;
  });
  return result;
}

function fillLilies(
  random: () => number,
  count: number,
  band: Band,
  grid: ReturnType<typeof createPlacedGrid>,
  worldZBase: number,
  exclusions: ExclusionZone[],
): LilyLocal[] {
  const out: LilyLocal[] = [];

  scatterInBand(
    random,
    count,
    band,
    grid,
    worldZBase,
    ISOLATED_RATIO,
    lilyDensityAt,
    (x, z) => {
      out.push({
        x,
        z,
        rotationY: random() * Math.PI * 2,
        tiltX: randomBetween(random, -0.12, 0.12),
        tiltZ: randomBetween(random, -0.12, 0.12),
        scale: randomBetween(random, band.scaleMin, band.scaleMax),
        phase: random() * Math.PI * 2,
        speed: randomBetween(random, 0.6, 1.1),
        tint: random(),
      });
    },
    exclusions,
  );

  return out;
}

/**
 * Genera los lirios locales de UN segmento del camino. Determinístico por
 * `index`, igual que `generateTileFlowers` — mismo patrón, semilla distinta
 * para que las dos especies no terminen coincidiendo posición por posición.
 */
export function generateTileLilies(index: number, counts: LilyTierCounts): Record<LilyVariantKey, LilyLocal[]> {
  const random = createSeededRandom(index * 5303 + 719);
  const variantCounts = computeLilyVariantCounts(counts);
  const result = {} as Record<LilyVariantKey, LilyLocal[]>;
  const worldZBase = index * TILE_LENGTH;

  // Rejilla propia (no compartida con la de girasoles): lirios y girasoles
  // pueden convivir muy cerca sin problema — son especies distintas, no
  // compiten por el mismo lugar exacto en el campo.
  const grid = createPlacedGrid(Math.max(...TIERS.map((t) => BAND_DEFS[t].minDist)));
  const exclusions = greeterExclusionZonesForTile(index);

  TIERS.forEach((tier) => {
    const band = BAND_DEFS[tier];
    STYLES.forEach((style) => {
      const key: LilyVariantKey = `${tier}-${style}`;
      result[key] = fillLilies(random, variantCounts[key], band, grid, worldZBase, exclusions);
    });
  });

  return result;
}
