import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

const RADIUS = 110;

function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 246, 214, 0.9)');
  gradient.addColorStop(0.35, 'rgba(255, 214, 140, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 214, 140, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** El sol recorre un arco simple sobre el camino: alto a mediodía
 * (progreso de ciclo 0), bajo el horizonte a medianoche (progreso 0.5).
 * Se desvanece progresivamente al llegar la noche. */
export function Sun() {
  const groupRef = useRef<THREE.Group>(null);
  const coreMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;

  useFrame(() => {
    const distance = scrollState.current.smoothDistance;
    const cycle = getCycleProgress(distance);
    getSkyState(cycle, skyState);

    const angle = cycle * Math.PI * 2;

    if (groupRef.current) {
      groupRef.current.position.set(
        Math.sin(angle) * RADIUS * 0.55,
        Math.cos(angle) * RADIUS,
        CHARACTER_Z - RADIUS * 0.4,
      );
    }

    if (coreMaterialRef.current) coreMaterialRef.current.opacity = skyState.sunOpacity;
    if (glowMaterialRef.current) glowMaterialRef.current.opacity = skyState.sunOpacity;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[5, 16, 16]} />
        <meshBasicMaterial ref={coreMaterialRef} color={colors.sunCore} transparent />
      </mesh>
      <sprite scale={[46, 46, 1]}>
        <spriteMaterial
          ref={glowMaterialRef}
          map={glowTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}
