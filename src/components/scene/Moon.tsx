import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_Z } from '../../lib/walk';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState, getMoonArcAngle } from '../../lib/dayNightCycle';

const ARC_WIDTH = 36;
const ARC_HEIGHT = 19;
const ARC_DEPTH = 42;

function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(232, 238, 255, 0.9)');
  gradient.addColorStop(0.35, 'rgba(190, 205, 245, 0.4)');
  gradient.addColorStop(0.7, 'rgba(170, 190, 240, 0.14)');
  gradient.addColorStop(1, 'rgba(170, 190, 240, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Textura de disco lunar: base pálida + un puñado de manchas suaves e
 * irregulares (mares lunares) para que se lea como una luna llena real en
 * vez de una esfera lisa de un solo color. Patrón fijo, no aleatorio, para
 * que la "cara" de la luna no cambie entre recargas. */
function createMoonTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const base = ctx.createRadialGradient(size * 0.42, size * 0.4, size * 0.05, size * 0.5, size * 0.5, size * 0.52);
  base.addColorStop(0, '#fbfaf5');
  base.addColorStop(0.6, '#eef1fb');
  base.addColorStop(1, '#d7ddf0');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const maria: [number, number, number, number][] = [
    [0.62, 0.34, 0.16, 0.16],
    [0.4, 0.55, 0.13, 0.11],
    [0.68, 0.62, 0.1, 0.09],
    [0.3, 0.28, 0.08, 0.07],
    [0.52, 0.78, 0.07, 0.06],
  ];
  for (const [cx, cy, rx, ry] of maria) {
    const grad = ctx.createRadialGradient(size * cx, size * cy, 0, size * cx, size * cy, size * Math.max(rx, ry));
    grad.addColorStop(0, 'rgba(150, 160, 190, 0.35)');
    grad.addColorStop(1, 'rgba(150, 160, 190, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(size * cx, size * cy, size * rx, size * ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

/**
 * Luna llena: un disco lejano en el cielo (no una esfera 3D grande cerca de
 * la cámara), con textura suave de "mares" para que se lea como luna real.
 * Recorre el mismo tipo de arco horizonte-a-horizonte que el sol (ver
 * `getMoonArcAngle`), desfasado para estar en lo alto durante la meseta
 * nocturna. La iluminación real que aporta al resto de la escena vive en
 * `Environment` (luz direccional de relleno), no aquí — este componente es
 * solo su representación visual.
 */
export function Moon() {
  const groupRef = useRef<THREE.Group>(null);
  const coreMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const haloMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const moonTexture = useMemo(() => createMoonTexture(), []);
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;

  useFrame(() => {
    const distance = scrollState.current.smoothDistance;
    const cycle = getCycleProgress(distance);
    getSkyState(cycle, skyState);

    const angle = getMoonArcAngle(cycle);

    if (groupRef.current) {
      groupRef.current.position.set(Math.cos(angle) * ARC_WIDTH, Math.sin(angle) * ARC_HEIGHT, CHARACTER_Z - ARC_DEPTH);
    }

    if (coreMaterialRef.current) coreMaterialRef.current.opacity = skyState.moonOpacity;
    if (glowMaterialRef.current) glowMaterialRef.current.opacity = skyState.moonOpacity;
    if (haloMaterialRef.current) haloMaterialRef.current.opacity = skyState.moonOpacity * 0.45;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[3.6, 24, 24]} />
        <meshBasicMaterial ref={coreMaterialRef} map={moonTexture} transparent />
      </mesh>
      <sprite scale={[34, 34, 1]}>
        <spriteMaterial
          ref={haloMaterialRef}
          map={glowTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite scale={[16, 16, 1]}>
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
