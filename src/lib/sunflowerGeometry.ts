import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from './colors';

/**
 * Construye una única geometría de girasol estilizado (tallo + hojas +
 * disco central + pétalos) con colores por vértice, lista para usarse en
 * un InstancedMesh. Fusionar todo en una sola geometría evita tener que
 * dibujar cada parte como un draw call independiente por instancia.
 */
export function createSunflowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const paint = (geometry: THREE.BufferGeometry, hex: string) => {
    const color = new THREE.Color(hex);
    const count = geometry.attributes.position.count;
    const colorArray = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colorArray[i * 3] = color.r;
      colorArray[i * 3 + 1] = color.g;
      colorArray[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    return geometry;
  };

  const stemHeight = 1.6;
  const stem = new THREE.CylinderGeometry(0.025, 0.045, stemHeight, 5, 2);
  stem.translate(0, stemHeight / 2, 0);
  parts.push(paint(stem, colors.stem));

  // Un par de hojas pequeñas y discretas a distinta altura del tallo.
  const leafShape = (y: number, side: number, angle: number) => {
    const leaf = new THREE.ConeGeometry(0.09, 0.24, 3, 1, true);
    leaf.rotateX(Math.PI / 2);
    leaf.rotateZ(angle);
    leaf.translate(side * 0.1, y, side * 0.03);
    return paint(leaf, colors.stemDark);
  };
  parts.push(leafShape(stemHeight * 0.35, 1, -0.5));
  parts.push(leafShape(stemHeight * 0.55, -1, 0.5));

  // Disco de pétalos: un cilindro aplanado nace mirando hacia +Y (hacia el
  // cielo), así que lo inclinamos para que la cara quede visible desde una
  // vista lateral/frontal, como un girasol "mirando" hacia afuera.
  const faceTilt = Math.PI * 0.4;
  const petals = new THREE.CylinderGeometry(0.42, 0.36, 0.06, 12, 1);
  petals.rotateX(faceTilt);
  petals.translate(0, stemHeight, 0.05);
  parts.push(paint(petals, colors.petal));

  // Centro oscuro del girasol, ligeramente por delante del disco de pétalos.
  const center = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 12, 1);
  center.rotateX(faceTilt);
  center.translate(0, stemHeight + 0.02, 0.09);
  parts.push(paint(center, colors.flowerCenter));

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  return merged;
}
