import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateTileGreeters, type TileGreeters } from '../../lib/generateTileGreeters';
import { TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { greeterNightState } from '../../lib/greeterNightState';
import { GreeterFigure, type GreeterFigureHandle } from './GreeterFigure';

/**
 * Personitas motivadoras a los costados del camino: mismo patrón de tiles
 * reciclables que `Sunflowers.tsx`/`Lilies.tsx`/`Road.tsx` (un `<group>`
 * por slot cuya posición Z se actualiza TODOS los cuadros, con coordenadas
 * de instancia puramente locales) — así permanecen clavadas en el paisaje
 * mientras el personaje las deja atrás, en vez de avanzar con el scroll.
 *
 * Cada tile puede traer HASTA DOS personitas (una por lado, decididas de
 * forma independiente en `generateTileGreeters`) — de ahí que cada slot
 * monte dos `GreeterFigure` en vez de una sola. Como mucho hay
 * `TOTAL_TILES * 2` (18) montadas a la vez, siempre ocultas
 * (`visible=false`) salvo que su tile tenga alguien de ese lado.
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
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<TileGreeters[]>(indices.map((index) => generateTileGreeters(index))).current;
  const firstFrame = useRef(true);
  const skyState = useRef(createSkyState()).current;

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
            ref={(el) => {
              leftFigureRefs.current[slot] = el;
            }}
          />
          <GreeterFigure
            ref={(el) => {
              rightFigureRefs.current[slot] = el;
            }}
          />
        </group>
      ))}
    </>
  );
}
