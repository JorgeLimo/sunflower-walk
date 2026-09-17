import { useEffect, useState } from 'react';
import type { LilyTierCounts } from './generateTileLilies';

export type ViewportTier = 'mobile' | 'tablet' | 'desktop';

function computeTier(width: number): ViewportTier {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** Detecta el tier de viewport (mobile/tablet/desktop) y lo actualiza en resize. */
export function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>(() =>
    typeof window === 'undefined' ? 'desktop' : computeTier(window.innerWidth),
  );

  useEffect(() => {
    let frame = 0;
    const handleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTier(computeTier(window.innerWidth)));
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
}

export interface TierSettings {
  fov: number;
  cameraDistanceScale: number;
  shadowMapSize: number;
  dpr: [number, number];
  sunflowersPerTile: SunflowerTierCounts;
  vegetationPerTile: VegetationTierCounts;
  liliesPerTile: LilyTierCounts;
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
    sunflowersPerTile: { foreground: 264, mid: 1260, background: 3400 },
    vegetationPerTile: { bushes: 9, rocks: 5, wildflowers: 60, grass: 300 },
    // Complementarios, nunca protagonistas: ~5% del total de girasoles.
    liliesPerTile: { near: 60, far: 170 },
    starCount: 2600,
    enableBloom: true,
    enableBirds: true,
  },
  tablet: {
    fov: 50,
    cameraDistanceScale: 1.15,
    shadowMapSize: 768,
    dpr: [1, 1.5],
    sunflowersPerTile: { foreground: 185, mid: 875, background: 2350 },
    vegetationPerTile: { bushes: 6, rocks: 3, wildflowers: 40, grass: 200 },
    liliesPerTile: { near: 42, far: 120 },
    starCount: 1800,
    enableBloom: true,
    enableBirds: true,
  },
  mobile: {
    fov: 58,
    cameraDistanceScale: 1.4,
    shadowMapSize: 512,
    dpr: [1, 1.4],
    sunflowersPerTile: { foreground: 84, mid: 360, background: 990 },
    vegetationPerTile: { bushes: 3, rocks: 2, wildflowers: 24, grass: 130 },
    liliesPerTile: { near: 18, far: 50 },
    starCount: 1100,
    enableBloom: false,
    enableBirds: false,
  },
};
