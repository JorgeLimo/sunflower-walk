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
import type { TulipDetail } from './tulipGeometry';

export interface TulipLocal {
  x: number;
  z: number;
  rotationY: number;
  tiltX: number;
  tiltZ: number;
  scale: number;
  phase: number;
  speed: number;
  /** Color discreto (nunca a medias): cada tulipán es claramente rosa
   * pastel O blanco, no un rosa lavado intermedio — es lo que hace que un
   * mismo cluster pueda leerse como "grupo mixto" en vez de una mancha de
   * un solo tono difuso. */
  isPink: boolean;
}

export type TulipTier = TulipDetail; // 'near' | 'far'
export type TulipStyle = 'a' | 'b';
export type TulipVariantKey = `${TulipTier}-${TulipStyle}`;

const TIERS: TulipTier[] = ['near', 'far'];
const STYLES: TulipStyle[] = ['a', 'b'];

export const TULIP_VARIANT_KEYS: TulipVariantKey[] = TIERS.flatMap((tier) =>
  STYLES.map((style) => `${tier}-${style}` as TulipVariantKey),
);

export interface TulipTierCounts {
  near: number;
  far: number;
}

interface Band extends SpatialBand {
  scaleMin: number;
  scaleMax: number;
}

// Tercera especie complementaria (después de lirio y florecillas silvestres):
// misma regla de siempre, nunca protagonista. Escala más chica que el lirio
// (el tulipán real es una planta baja y compacta) y bandas corridas un poco
// más cerca del camino que las del lirio — es la franja donde ya hay césped
// y hojas de suelo más ricas, pero todavía sin ningún acento de color propio
// a esa distancia tan corta (las florecillas silvestres empiezan recién en
// +1.4, el lirio en +0.8).
// Escala recalibrada contra el girasol de primer plano: con la geometría
// base (`tulipGeometry.ts`, stemHeight 0.22-0.3 + petalLength 0.075-0.1 ≈
// 0.35 de alto promedio SIN escalar) y un girasol cercano que promedia
// ~0.9 de alto (tallo 1.6*0.4-0.54 + cabeza), llegar al ~80% pedido (≈0.72)
// requiere una escala de instancia promedio ≈2.05 — de ahí el salto de
// 0.7-1.0 a 1.7-2.4 en vez de un simple retoque. `minDist` sube en la misma
// proporción (mismo criterio que usa `generateTileFlowers.ts`: una flor más
// grande necesita más espacio propio para no leerse amontonada).
const BAND_DEFS: Record<TulipTier, Band> = {
  near: {
    xMin: ROAD_WIDTH / 2 + 0.4,
    xMax: ROAD_WIDTH / 2 + 7,
    scaleMin: 1.7,
    scaleMax: 2.4,
    minDist: 0.62,
  },
  far: {
    xMin: ROAD_WIDTH / 2 + 5,
    xMax: ROAD_WIDTH / 2 + 40,
    scaleMin: 1.2,
    scaleMax: 1.9,
    minDist: 0.46,
  },
};

// Predominan los individuales y las parejas, igual que pide el pedido
// ("algunos tulipanes individuales, pequeños grupos de 2 o 3").
const ISOLATED_RATIO = 0.44;

// Fase y frecuencia propias (distintas de girasol y lirio) para que los
// tramos más poblados de tulipanes no coincidan siempre con los de las
// otras especies — variedad real, no un patrón que se repite en capas.
function tulipDensityAt(worldZ: number): number {
  return fieldDensityAt(worldZ, 0.58, 4.4, 1.15);
}

export function computeTulipVariantCounts(counts: TulipTierCounts): Record<TulipVariantKey, number> {
  const result = {} as Record<TulipVariantKey, number>;
  TIERS.forEach((tier) => {
    const total = counts[tier];
    const styleA = Math.ceil(total / 2);
    result[`${tier}-a`] = styleA;
    result[`${tier}-b`] = total - styleA;
  });
  return result;
}

function fillTulips(
  random: () => number,
  count: number,
  band: Band,
  grid: ReturnType<typeof createPlacedGrid>,
  worldZBase: number,
  exclusions: ExclusionZone[],
): TulipLocal[] {
  const out: TulipLocal[] = [];

  scatterInBand(
    random,
    count,
    band,
    grid,
    worldZBase,
    ISOLATED_RATIO,
    tulipDensityAt,
    (x, z) => {
      out.push({
        x,
        z,
        rotationY: random() * Math.PI * 2,
        tiltX: randomBetween(random, -0.1, 0.1),
        tiltZ: randomBetween(random, -0.1, 0.1),
        scale: randomBetween(random, band.scaleMin, band.scaleMax),
        phase: random() * Math.PI * 2,
        speed: randomBetween(random, 0.6, 1.1),
        // Levemente más blancos que rosas (0.46 de probabilidad de rosa):
        // dos tonos casi parejos, sin que ninguno domine el otro.
        isPink: random() < 0.46,
      });
    },
    exclusions,
  );

  return out;
}

/**
 * Genera los tulipanes locales de UN segmento del camino. Determinístico por
 * `index`, mismo patrón que `generateTileLilies` — semilla propia para que
 * las tres especies (girasol, lirio, tulipán) no terminen coincidiendo
 * posición por posición.
 */
export function generateTileTulips(index: number, counts: TulipTierCounts): Record<TulipVariantKey, TulipLocal[]> {
  const random = createSeededRandom(index * 6151 + 2837);
  const variantCounts = computeTulipVariantCounts(counts);
  const result = {} as Record<TulipVariantKey, TulipLocal[]>;
  const worldZBase = index * TILE_LENGTH;

  // Rejilla propia (no compartida con girasol/lirio): especies distintas
  // pueden convivir muy cerca sin competir por el mismo punto exacto.
  const grid = createPlacedGrid(Math.max(...TIERS.map((t) => BAND_DEFS[t].minDist)));
  const exclusions = greeterExclusionZonesForTile(index);

  TIERS.forEach((tier) => {
    const band = BAND_DEFS[tier];
    STYLES.forEach((style) => {
      const key: TulipVariantKey = `${tier}-${style}`;
      result[key] = fillTulips(random, variantCounts[key], band, grid, worldZBase, exclusions);
    });
  });

  return result;
}
