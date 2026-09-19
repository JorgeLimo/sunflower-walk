import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateTileGreeters, type TileGreeters } from '../../lib/generateTileGreeters';
import { TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { greeterNightState } from '../../lib/greeterNightState';
import { GreeterFigure, type GreeterFigureHandle } from './GreeterFigure';
import { useViewportTier, type ViewportTier } from '../../lib/viewport';

// En pantallas chicas la escena se ve desde más lejos y en vertical, así que
// las personitas —y sobre todo su cartel— se agrandan para que el mensaje
// pueda leerse a media distancia sin acercarse.
const BOOST: Record<ViewportTier, { figure: number; sign: number }> = {
  desktop: { figure: 1, sign: 1 },
  tablet: { figure: 1.1, sign: 1.2 },
  mobile: { figure: 1.25, sign: 1.45 },
};

/**
 * Personitas motivadoras a los costados del camino: mismo patrón de tiles
 * reciclables que `Sunflowers.tsx`/`Lilies.tsx`/`Road.tsx` (un `<group>`
 * por slot cuya posición Z se actualiza TODOS los cuadros, con coordenadas
 * de instancia puramente locales) — así permanecen clavadas en el paisaje
 * mientras el personaje las deja atrás, en vez de avanzar con el scroll.
 *
 * Cada tile puede traer HASTA SEIS personitas (cercana, lejana y de fondo por lado,
 * decididas de forma independiente en `generateTileGreeters`) — de ahí que
 * cada slot monte seis `GreeterFigure` en vez de dos. Como mucho hay
 * `TOTAL_TILES * 6` (54) montadas a la vez, siempre ocultas
 * (`visible=false`) salvo que su tile tenga alguien en esa posición.
 *
 * También es quien mantiene `greeterNightState.nightFactor` al día: ya
 * recorre el ciclo día/noche para nada más que mover los tiles, así que
 * aprovechar esa misma lectura evita que cada una de las personitas
 * recalcule `getSkyState` por su cuenta solo para saber si debe encender su
 * cartel.
 */
export function Greeters() {
  const scrollState = useScrollState();
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const leftFigureRefs = useRef<(GreeterFigureHandle | null)[]>([]);
  const rightFigureRefs = useRef<(GreeterFigureHandle | null)[]>([]);
  const farLeftFigureRefs = useRef<(GreeterFigureHandle | null)[]>([]);
  const farRightFigureRefs = useRef<(GreeterFigureHandle | null)[]>([]);
  const wideLeftFigureRefs = useRef<(GreeterFigureHandle | null)[]>([]);
  const wideRightFigureRefs = useRef<(GreeterFigureHandle | null)[]>([]);
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<TileGreeters[]>(indices.map((index) => generateTileGreeters(index))).current;
  const firstFrame = useRef(true);
  const skyState = useRef(createSkyState()).current;
  const tier = useViewportTier();
  const boost = BOOST[tier];

  // Al cambiar de tier (p. ej. rotar el dispositivo) hay que volver a
  // aplicar el tamaño a las que ya están en escena.
  useEffect(() => {
    if (firstFrame.current) return;
    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      const t = tileLocals[slot];
      leftFigureRefs.current[slot]?.apply(t.left);
      rightFigureRefs.current[slot]?.apply(t.right);
      farLeftFigureRefs.current[slot]?.apply(t.farLeft);
      farRightFigureRefs.current[slot]?.apply(t.farRight);
      wideLeftFigureRefs.current[slot]?.apply(t.wideLeft);
      wideRightFigureRefs.current[slot]?.apply(t.wideRight);
    }
  }, [tier, tileLocals]);

  useFrame(() => {
    const distance = scrollState.current.smoothDistance;
    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    const recycled = recycleTileIndices(indices, targetMinIndex);
    const isFirstFrame = firstFrame.current;
    firstFrame.current = false;

    getSkyState(getCycleProgress(distance), skyState);
    greeterNightState.nightFactor = skyState.nightFactor;

    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      const group = groupRefs.current[slot];
      if (group) group.position.z = tileRenderZ(indices[slot], distance);

      if (recycled[slot] || isFirstFrame) {
        if (recycled[slot]) tileLocals[slot] = generateTileGreeters(indices[slot]);
        leftFigureRefs.current[slot]?.apply(tileLocals[slot].left);
        rightFigureRefs.current[slot]?.apply(tileLocals[slot].right);
        farLeftFigureRefs.current[slot]?.apply(tileLocals[slot].farLeft);
        farRightFigureRefs.current[slot]?.apply(tileLocals[slot].farRight);
        wideLeftFigureRefs.current[slot]?.apply(tileLocals[slot].wideLeft);
        wideRightFigureRefs.current[slot]?.apply(tileLocals[slot].wideRight);
      }
    }
  });

  return (
    <>
      {Array.from({ length: TOTAL_TILES }).map((_, slot) => (
        <group
          key={slot}
          ref={(el) => {
            groupRefs.current[slot] = el;
          }}
          position={[0, 0, tileRenderZ(indices[slot], 0)]}
        >
          <GreeterFigure
            figureBoost={boost.figure}
            signBoost={boost.sign}
            ref={(el) => {
              leftFigureRefs.current[slot] = el;
            }}
          />
          <GreeterFigure
            figureBoost={boost.figure}
            signBoost={boost.sign}
            ref={(el) => {
              rightFigureRefs.current[slot] = el;
            }}
          />
          <GreeterFigure
            figureBoost={boost.figure}
            signBoost={boost.sign}
            ref={(el) => {
              farLeftFigureRefs.current[slot] = el;
            }}
          />
          <GreeterFigure
            figureBoost={boost.figure}
            signBoost={boost.sign}
            ref={(el) => {
              farRightFigureRefs.current[slot] = el;
            }}
          />
          <GreeterFigure
            figureBoost={boost.figure}
            signBoost={boost.sign}
            ref={(el) => {
              wideLeftFigureRefs.current[slot] = el;
            }}
          />
          <GreeterFigure
            figureBoost={boost.figure}
            signBoost={boost.sign}
            ref={(el) => {
              wideRightFigureRefs.current[slot] = el;
            }}
          />
        </group>
      ))}
    </>
  );
}
