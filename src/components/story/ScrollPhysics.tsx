import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScrollState } from './scrollContext';
import { damp } from '../../lib/random';

/**
 * Corre dentro del Canvas y convierte `rawDistance` (crudo, escrito
 * directamente por el scroll del DOM) en `smoothDistance` y `velocity`
 * suavizadas — la cadena rawScroll → smoothScroll → velocity que
 * consumen la cámara, los personajes y el ciclo día/noche.
 */
export function ScrollPhysics() {
  const scrollState = useScrollState();
  const lastRaw = useRef(0);

  useFrame((_, delta) => {
    const s = scrollState.current;
    const dt = Math.max(delta, 0.0001);

    const instantVelocity = (s.rawDistance - lastRaw.current) / dt;
    lastRaw.current = s.rawDistance;

    s.velocity = damp(s.velocity, instantVelocity, 4, dt);
    s.smoothDistance = damp(s.smoothDistance, s.rawDistance, 5, dt);
  });

  return null;
}
