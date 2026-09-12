import { createSeededRandom, randomBetween } from './random';
import { ROAD_WIDTH, TILE_LENGTH } from './constants';
import type { SunflowerTierCounts } from './viewport';

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
}

interface Band {
  count: number;
  xMin: number;
  xMax: number;
  scaleMin: number;
  scaleMax: number;
  heightMin: number;
  heightMax: number;
}

function fillBand(random: () => number, band: Band, out: FlowerLocal[]) {
  for (let i = 0; i < band.count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * randomBetween(random, band.xMin, band.xMax);
    out.push({
      x,
      z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
      rotationY: random() * Math.PI * 2,
      tiltX: randomBetween(random, -0.05, 0.05),
      tiltZ: randomBetween(random, -0.05, 0.05),
      scaleXZ: randomBetween(random, band.scaleMin, band.scaleMax),
      scaleY: randomBetween(random, band.heightMin, band.heightMax),
      phase: random() * Math.PI * 2,
      speed: randomBetween(random, 0.7, 1.3),
    });
  }
}

/**
 * Genera los girasoles locales de UN segmento del camino, en tres bandas
 * de profundidad (primer plano grande junto al camino, medio, y fondo
 * pequeño y numeroso). Determinístico por `index`, así que el mismo
 * segmento siempre se ve igual si se regenera.
 */
export function generateTileFlowers(index: number, counts: SunflowerTierCounts): FlowerLocal[] {
  const random = createSeededRandom(index * 7919 + 101);
  const out: FlowerLocal[] = [];

  fillBand(
    random,
    {
      count: counts.foreground,
      xMin: ROAD_WIDTH / 2 + 0.25,
      xMax: ROAD_WIDTH / 2 + 2.2,
      scaleMin: 1.15,
      scaleMax: 1.7,
      heightMin: 1.1,
      heightMax: 1.6,
    },
    out,
  );

  fillBand(
    random,
    {
      count: counts.mid,
      xMin: ROAD_WIDTH / 2 + 2,
      xMax: ROAD_WIDTH / 2 + 14,
      scaleMin: 0.75,
      scaleMax: 1.15,
      heightMin: 0.8,
      heightMax: 1.2,
    },
    out,
  );

  fillBand(
    random,
    {
      count: counts.background,
      xMin: ROAD_WIDTH / 2 + 12,
      xMax: ROAD_WIDTH / 2 + 42,
      scaleMin: 0.5,
      scaleMax: 0.9,
      heightMin: 0.55,
      heightMax: 0.95,
    },
    out,
  );

  return out;
}
