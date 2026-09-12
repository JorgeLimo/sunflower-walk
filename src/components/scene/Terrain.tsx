import { useMemo } from 'react';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { CHARACTER_Z } from '../../lib/walk';

const WIDTH = 140;
const LENGTH = 260;

/**
 * El terreno es un plano de color liso sin textura ni costuras visibles,
 * así que puede quedarse fijo: como la persona también permanece anclada
 * en CHARACTER_Z (ver lib/walk.ts), no hace falta moverlo cuadro a cuadro.
 */
export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WIDTH, LENGTH, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, 0, CHARACTER_Z - LENGTH / 4]} receiveShadow>
      <meshStandardMaterial color={colors.groundNear} roughness={1} />
    </mesh>
  );
}
