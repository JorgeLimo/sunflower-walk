import { useEffect, useState } from 'react';

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

export interface TierSettings {
  fov: number;
  cameraDistanceScale: number;
  shadowMapSize: number;
  dpr: [number, number];
  sunflowersPerTile: SunflowerTierCounts;
  starCount: number;
  enableBloom: boolean;
  enableBirds: boolean;
}

export const TIER_SETTINGS: Record<ViewportTier, TierSettings> = {
  desktop: {
    fov: 45,
    cameraDistanceScale: 1,
    shadowMapSize: 1024,
    dpr: [1, 1.75],
    sunflowersPerTile: { foreground: 7, mid: 13, background: 24 },
    starCount: 2600,
    enableBloom: true,
    enableBirds: true,
  },
  tablet: {
    fov: 50,
    cameraDistanceScale: 1.15,
    shadowMapSize: 768,
    dpr: [1, 1.5],
    sunflowersPerTile: { foreground: 5, mid: 10, background: 16 },
    starCount: 1800,
    enableBloom: true,
    enableBirds: true,
  },
  mobile: {
    fov: 58,
    cameraDistanceScale: 1.4,
    shadowMapSize: 512,
    dpr: [1, 1.4],
    sunflowersPerTile: { foreground: 3, mid: 6, background: 10 },
    starCount: 1100,
    enableBloom: false,
    enableBirds: false,
  },
};
