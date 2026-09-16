import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { getCycleProgress, getSkyState, createSkyState, getSunArcAngle } from '../../lib/dayNightCycle';

/** Ancho/alto del arco (no un radio de órbita completo — ver `getSunArcAngle`)
 * y qué tan lejos del personaje se mantiene, elegidos para que el punto más
 * alto del arco quede cómodamente dentro del encuadre de la cámara en vez
 * de directamente sobre ella. */
const ARC_WIDTH = 38;
const ARC_HEIGHT = 20;
const ARC_DEPTH = 42;

function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 248, 222, 0.95)');
  gradient.addColorStop(0.32, 'rgba(255, 221, 150, 0.55)');
  gradient.addColorStop(0.65, 'rgba(255, 200, 120, 0.18)');
  gradient.addColorStop(1, 'rgba(255, 200, 120, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** El sol recorre un arco de horizonte a horizonte (ver `getSunArcAngle` en
 * `dayNightCycle.ts`), en vez de una órbita circular completa — así su
 * punto más alto queda dentro del encuadre de la cámara y se desvanece
 * justo al tocar el horizonte en vez de quedar invisible sobre el cenit. */
export function Sun() {
  const groupRef = useRef<THREE.Group>(null);
  const coreMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const haloMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;

  useFrame(() => {
    const distance = scrollState.current.smoothDistance;
    const cycle = getCycleProgress(distance);
    getSkyState(cycle, skyState);

    const angle = getSunArcAngle(cycle);

    // En los extremos del arco `sin(angle)` vale 0, así que el astro queda a
    // la altura del suelo: su esfera y sus halos aditivos atraviesan el plano
    // del terreno —que sí escribe profundidad— y se recortan con un borde
    // recto, produciendo ese "círculo partido por la mitad" que asomaba de
    // golpe durante la transición. En vez de mover el arco (perderíamos el
    // astro bajo del amanecer/atardecer), se desvanece mientras está tan bajo
    // como para que el recorte se note.
    const height = Math.sin(angle) * ARC_HEIGHT;
    const horizonFade = THREE.MathUtils.smoothstep(height, 7, 12);

    if (groupRef.current) {
      groupRef.current.position.set(Math.cos(angle) * ARC_WIDTH, height, CHARACTER_Z - ARC_DEPTH);
    }

    if (coreMaterialRef.current) coreMaterialRef.current.opacity = skyState.sunOpacity * horizonFade;
    if (glowMaterialRef.current) glowMaterialRef.current.opacity = skyState.sunOpacity * horizonFade;
    if (haloMaterialRef.current) haloMaterialRef.current.opacity = skyState.sunOpacity * 0.5 * horizonFade;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[5.2, 20, 20]} />
        <meshBasicMaterial ref={coreMaterialRef} color={colors.sunCore} transparent />
      </mesh>
      {/* Halo amplio y suave: le da presencia atmosférica sin verse como un
          disco sólido agrandado. */}
      <sprite scale={[46, 46, 1]}>
        <spriteMaterial
          ref={haloMaterialRef}
          map={glowTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite scale={[24, 24, 1]}>
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
