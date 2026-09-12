import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud } from '@react-three/drei';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { CHARACTER_Z } from '../../lib/walk';

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
      y: randomBetween(random, 26, 42),
      z: randomBetween(random, -60, 40),
      scale: randomBetween(random, 0.9, 1.8),
      opacity: randomBetween(random, 0.5, 0.75),
      speed: randomBetween(random, 0.15, 0.4),
    });
  }
  return specs;
}

const DRIFT_RANGE = 70;
// Ancho del ciclo de deriva horizontal: usamos módulo sobre el tiempo para
// que la posición nunca crezca sin límite en sesiones muy largas.
const DRIFT_WRAP = 400;

function DriftingCloud({ spec }: { spec: CloudSpec }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = (state.clock.elapsedTime * spec.speed) % DRIFT_WRAP;
    group.current.position.x = spec.x + Math.sin(t * 0.1) * DRIFT_RANGE * 0.5 + t * 0.6;
  });

  return (
    <group ref={group} position={[spec.x, spec.y, spec.z]}>
      <Cloud
        seed={spec.id}
        scale={spec.scale}
        opacity={spec.opacity}
        speed={0.06}
        segments={18}
        bounds={[2.6, 0.8, 1.6]}
        volume={6}
        color="#ffffff"
        fade={40}
      />
    </group>
  );
}

interface CloudsProps {
  count: number;
}

/** Nubes ancladas cerca de la persona (que ahora permanece fija en
 * CHARACTER_Z — ver lib/walk.ts), con una deriva horizontal propia. */
export function Clouds({ count }: CloudsProps) {
  const specs = useMemo(() => generateClouds(count), [count]);

  return (
    <group position={[0, 0, CHARACTER_Z]}>
      {specs.map((spec) => (
        <DriftingCloud key={spec.id} spec={spec} />
      ))}
    </group>
  );
}
