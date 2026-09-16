import { useMemo } from 'react';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { CHARACTER_Z } from '../../lib/walk';
import { ROAD_WIDTH } from '../../lib/constants';

const WIDTH = 140;
const LENGTH = 260;
// Suficiente subdivisión para poder ondular el terreno en Y sin que se note
// facetado (siguen siendo ~6000 vértices, un único draw call estático — no
// tiene costo por frame).
const WIDTH_SEGMENTS = 56;
const LENGTH_SEGMENTS = 104;

/** Ruido barato (suma de senos a distintas frecuencias/fases) para las
 * ondulaciones del terreno y las manchas de color — no repite un patrón de
 * grilla visible como una sola onda, y no necesita una librería de ruido de
 * gradiente para algo tan sutil. */
function fieldNoise(x: number, z: number): number {
  return (
    Math.sin(x * 0.15 + z * 0.11) * 0.5 +
    Math.sin(x * 0.06 - z * 0.19 + 1.7) * 0.35 +
    Math.sin(x * 0.31 + z * 0.05 + 4.2) * 0.15
  );
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// El césped nunca se ondula cerca del camino: Road.tsx es una malla plana
// aparte apoyada a y≈0.01, así que si el terreno se deformara justo debajo
// asomaría por los bordes o dejaría un hueco. Se atenúa a 0 con un
// smoothstep bastante antes del borde del camino.
const ROAD_CLEAR = ROAD_WIDTH / 2 + 1.2;
const ROAD_FADE = 3;

/**
 * El terreno es un plano fijo (la persona permanece anclada en CHARACTER_Z,
 * ver lib/walk.ts, así que no hace falta moverlo cuadro a cuadro), pero ya
 * no es perfectamente plano: una ondulación sutil por vértice (apagada cerca
 * del camino) y manchas de color superpuestas al degradado cerca/lejos le
 * dan la sensación de un campo real en vez de una superficie de un solo
 * color con objetos apoyados encima.
 */
export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WIDTH, LENGTH, WIDTH_SEGMENTS, LENGTH_SEGMENTS);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const near = new THREE.Color(colors.groundNear);
    const far = new THREE.Color(colors.groundFar);
    const patchA = new THREE.Color(colors.groundNear).offsetHSL(0, 0.04, 0.035);
    const patchB = new THREE.Color(colors.groundFar).offsetHSL(-0.01, 0.03, -0.03);
    const colorArr = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      // Tras la rotación, +Z local es el borde cercano (detrás/al lado de
      // la cámara) y -Z local es el borde lejano (hacia el horizonte).
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const roadClear = smoothstep(ROAD_CLEAR, ROAD_CLEAR + ROAD_FADE, Math.abs(x));
      pos.setY(i, fieldNoise(x, z) * 0.12 * roadClear);

      const t = THREE.MathUtils.clamp((LENGTH / 2 - z) / LENGTH, 0, 1);
      const c = near.clone().lerp(far, t);
      // Parches sutiles (más oscuros/más claros que el degradado base) para
      // romper el verde uniforme, con su propia frecuencia de ruido para
      // que no coincidan visualmente con las ondulaciones de altura.
      const patchT = (fieldNoise(x * 1.7 + 50, z * 1.7 - 30) + 1) / 2;
      const patch = patchA.clone().lerp(patchB, patchT);
      c.lerp(patch, 0.34);

      colorArr[i * 3] = c.r;
      colorArr[i * 3 + 1] = c.g;
      colorArr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    geo.computeVertexNormals();

    return geo;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, 0, CHARACTER_Z - LENGTH / 4]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}
