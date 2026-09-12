import { useMemo } from 'react';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { CHARACTER_Z } from '../../lib/walk';

const WIDTH = 140;
const LENGTH = 260;

/**
 * El terreno es un plano sin textura ni costuras visibles, así que puede
 * quedarse fijo: como la persona también permanece anclada en CHARACTER_Z
 * (ver lib/walk.ts), no hace falta moverlo cuadro a cuadro. Un degradado por
 * vértice (verde vívido cerca, más pálido y frío hacia el horizonte) da una
 * pista de perspectiva aérea, para que no se sienta como una superficie
 * plana de un solo color con objetos apoyados encima.
 */
export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WIDTH, LENGTH, 1, 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const near = new THREE.Color(colors.groundNear);
    const far = new THREE.Color(colors.groundFar);
    const colorArr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // Tras la rotación, +Z local es el borde cercano (detrás/al lado de
      // la cámara) y -Z local es el borde lejano (hacia el horizonte).
      const z = pos.getZ(i);
      const t = THREE.MathUtils.clamp((LENGTH / 2 - z) / LENGTH, 0, 1);
      const c = near.clone().lerp(far, t);
      colorArr[i * 3] = c.r;
      colorArr[i * 3 + 1] = c.g;
      colorArr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));

    return geo;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, 0, CHARACTER_Z - LENGTH / 4]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}
