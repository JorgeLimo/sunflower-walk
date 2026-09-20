import { useEffect, useState } from 'react';
import type { LilyTierCounts } from './generateTileLilies';
import type { TulipTierCounts } from './generateTileTulips';

export type ViewportTier = 'mobile' | 'tablet' | 'desktop';

// Teléfono girado a horizontal: su ancho pasaría a ser el largo (p. ej. 844),
// lo que cambiaría el nivel de calidad a "tablet" y regeneraría todo el campo
// solo por girar. Se mide entonces con el lado corto, así el nivel es el
// mismo en vertical y horizontal (la experiencia está tapada en horizontal).
const LANDSCAPE_PHONE = '(orientation: landscape) and (pointer: coarse) and (max-height: 520px)';

function effectiveWidth(): number {
  return window.matchMedia(LANDSCAPE_PHONE).matches ? window.innerHeight : window.innerWidth;
}

function computeTier(width: number): ViewportTier {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** Detecta el tier de viewport (mobile/tablet/desktop) y lo actualiza en resize. */
export function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>(() =>
    typeof window === 'undefined' ? 'desktop' : computeTier(effectiveWidth()),
  );

  useEffect(() => {
    let frame = 0;
    const handleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTier(computeTier(effectiveWidth())));
    };
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return tier;
}

export interface SunflowerTierCounts {
  foreground: number;
  mid: number;
  background: number;
}

export interface VegetationTierCounts {
  bushes: number;
  rocks: number;
  wildflowers: number;
  grass: number;
  /** Matas de hierba más altas que `grass` — segunda capa de altura para que
   * el césped no se sienta todo del mismo tamaño. */
  tallGrass: number;
  /** Hojitas de suelo (tréboles/matas bajas) dispersas entre los tallos: la
   * capa que "arraiga" visualmente a los girasoles al terreno, en vez de
   * dejarlos apoyados sobre césped liso. */
  groundLeaves: number;
}

export interface TierSettings {
  fov: number;
  cameraDistanceScale: number;
  shadowMapSize: number;
  dpr: [number, number];
  sunflowersPerTile: SunflowerTierCounts;
  vegetationPerTile: VegetationTierCounts;
  liliesPerTile: LilyTierCounts;
  tulipsPerTile: TulipTierCounts;
  starCount: number;
  enableBloom: boolean;
  enableBirds: boolean;
}

// `sunflowersPerTile` es por SEGMENTO de camino (32 unidades de largo) y hay
// 9 segmentos vivos a la vez, así que el desktop sostiene ~2100 plantas. El
// salto grande está en `background`: es la franja que llega hasta ±100 de
// ancho y la que hace que el campo siga leyéndose hasta el horizonte en vez
// de cortarse en una franja de césped vacío a los lados.
export const TIER_SETTINGS: Record<ViewportTier, TierSettings> = {
  desktop: {
    fov: 45,
    cameraDistanceScale: 1,
    shadowMapSize: 1024,
    dpr: [1, 1.75],
    sunflowersPerTile: { foreground: 520, mid: 1900, background: 5100 },
    vegetationPerTile: { bushes: 9, rocks: 5, wildflowers: 60, grass: 340, tallGrass: 110, groundLeaves: 260 },
    // Complementarios, nunca protagonistas: ~5% del total de girasoles.
    liliesPerTile: { near: 60, far: 170 },
    tulipsPerTile: { near: 200, far: 560 },
    starCount: 2600,
    enableBloom: true,
    enableBirds: true,
  },
  tablet: {
    fov: 50,
    cameraDistanceScale: 1.15,
    shadowMapSize: 768,
    dpr: [1, 1.5],
    sunflowersPerTile: { foreground: 365, mid: 1310, background: 3520 },
    vegetationPerTile: { bushes: 6, rocks: 3, wildflowers: 40, grass: 230, tallGrass: 75, groundLeaves: 175 },
    liliesPerTile: { near: 42, far: 120 },
    tulipsPerTile: { near: 136, far: 380 },
    starCount: 1800,
    enableBloom: true,
    enableBirds: true,
  },
  mobile: {
    fov: 58,
    cameraDistanceScale: 1.4,
    shadowMapSize: 512,
    dpr: [1, 1.4],
    sunflowersPerTile: { foreground: 150, mid: 520, background: 1420 },
    vegetationPerTile: { bushes: 3, rocks: 2, wildflowers: 24, grass: 150, tallGrass: 34, groundLeaves: 80 },
    liliesPerTile: { near: 18, far: 50 },
    tulipsPerTile: { near: 60, far: 150 },
    starCount: 1100,
    enableBloom: false,
    enableBirds: false,
  },
};
