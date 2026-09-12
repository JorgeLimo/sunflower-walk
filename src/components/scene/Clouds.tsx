import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud } from '@react-three/drei';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { CHARACTER_Z } from '../../lib/walk';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

interface CloudSpec {
  id: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  speed: number;
}

function generateClouds(count: number): CloudSpec[] {
  const random = createSeededRandom(99);
  const specs: CloudSpec[] = [];
  for (let i = 0; i < count; i++) {
    specs.push({
      id: i,
      x: randomBetween(random, -90, 90),
      y: randomBetween(random, 24, 38),
      // Siempre bien adelante del personaje (Z negativo relativo a
      // CHARACTER_Z), nunca detrás — así jamás terminan entre la cámara y
      // la persona/el Pug.
      z: randomBetween(random, -95, -25),
      scale: randomBetween(random, 1.5, 2.8),
      opacity: randomBetween(random, 0.55, 0.78),
      speed: randomBetween(random, 0.04, 0.1),
    });
  }
  return specs;
}

const DRIFT_RANGE = 70;
// Ancho del ciclo de deriva horizontal: usamos módulo sobre el tiempo para
// que la posición nunca crezca sin límite en sesiones muy largas.
const DRIFT_WRAP = 500;

function DriftingCloud({ spec, color }: { spec: CloudSpec; color: string }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = (state.clock.elapsedTime * spec.speed) % DRIFT_WRAP;
    group.current.position.x = spec.x + Math.sin(t * 0.1) * DRIFT_RANGE * 0.5 + t * 0.15;
  });

  return (
    <group ref={group} position={[spec.x, spec.y, spec.z]}>
      <Cloud
        seed={spec.id}
        scale={spec.scale}
        opacity={spec.opacity}
        speed={0.05}
        segments={20}
        bounds={[3.2, 1, 2]}
        volume={7.5}
        color={color}
        fade={45}
      />
    </group>
  );
}

interface CloudsProps {
  count: number;
}

/**
 * Nubes ancladas cerca de la persona (que permanece fija en CHARACTER_Z —
 * ver lib/walk.ts), pocas y grandes, con una deriva horizontal muy lenta.
 * Su color se tiñe suavemente según la hora del día (reutiliza el mismo
 * `fogColor` del cielo, mezclado con blanco para que sigan leyéndose como
 * nubes) en vez de quedarse blancas fijas todo el ciclo.
 */
export function Clouds({ count }: CloudsProps) {
  const specs = useMemo(() => generateClouds(count), [count]);
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;
  const [tint, setTint] = useState('#ffffff');
  const acc = useRef(0);
  const tintColor = useRef(new THREE.Color());

  useFrame((_, delta) => {
    const distance = scrollState.current.smoothDistance;
    getSkyState(getCycleProgress(distance), skyState);

    acc.current += delta;
    if (acc.current > 0.35) {
      acc.current = 0;
      tintColor.current.set('#ffffff').lerp(skyState.fogColor, 0.55);
      setTint(`#${tintColor.current.getHexString()}`);
    }
  });

  return (
    <group position={[0, 0, CHARACTER_Z]}>
      {specs.map((spec) => (
        <DriftingCloud key={spec.id} spec={spec} color={tint} />
      ))}
    </group>
  );
}
