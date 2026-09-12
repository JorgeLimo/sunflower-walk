import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_Z } from '../../lib/walk';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

const RADIUS = 110;

function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(230, 236, 255, 0.85)');
  gradient.addColorStop(0.4, 'rgba(180, 195, 240, 0.35)');
  gradient.addColorStop(1, 'rgba(180, 195, 240, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Luna llena: un disco lejano en el cielo (no una esfera 3D grande cerca
 * de la cámara). Recorre el mismo arco que el sol pero desfasada medio
 * ciclo, así que está en lo alto durante la noche. La iluminación real
 * que aporta al resto de la escena vive en `Environment` (luz direccional
 * de relleno), no aquí — este componente es solo su representación visual.
 */
export function Moon() {
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

    const angle = (cycle + 0.5) * Math.PI * 2;

    if (groupRef.current) {
      groupRef.current.position.set(
        Math.sin(angle) * RADIUS * 0.55,
        Math.cos(angle) * RADIUS,
        CHARACTER_Z - RADIUS * 0.4,
      );
    }

    if (coreMaterialRef.current) coreMaterialRef.current.opacity = skyState.moonOpacity;
    if (glowMaterialRef.current) glowMaterialRef.current.opacity = skyState.moonOpacity;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[3.2, 16, 16]} />
        <meshBasicMaterial ref={coreMaterialRef} color="#eef1ff" transparent />
      </mesh>
      <sprite scale={[30, 30, 1]}>
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
