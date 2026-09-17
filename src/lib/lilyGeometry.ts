import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from './colors';
import { createSeededRandom, randomBetween } from './random';

/**
 * Geometría del lirio blanco: planta complementaria del campo, deliberadamente
 * más simple y barata que el girasol (`sunflowerGeometry.ts`) — es una
 * especie secundaria, no debe competir en presupuesto de triángulos ni en
 * protagonismo visual. Todo en UNA sola malla fusionada por planta (a
 * diferencia del girasol, que separa tallo/cabeza para el balanceo
 * independiente): un lirio meciéndose como un solo bloque es indistinguible
 * de uno con balanceo articulado a la escala en que se ve.
 */

export type LilyDetail = 'near' | 'far';

interface LilyDetailConfig {
  leafCount: number;
  leafSegments: number;
  petalCount: number;
  stamens: boolean;
}

// 'far' recorta segmentos y quita las anteras — a la distancia de la franja
// lejana no se distinguen, y son cientos de instancias.
const DETAIL_CONFIG: Record<LilyDetail, LilyDetailConfig> = {
  near: { leafCount: 4, leafSegments: 3, petalCount: 6, stamens: true },
  far: { leafCount: 3, leafSegments: 2, petalCount: 5, stamens: false },
};

const leafColorBase = new THREE.Color(colors.stemDark);
const leafColorTip = new THREE.Color(colors.stem);
// Blanco cálido, no blanco puro (que se ve plano/artificial bajo la luz
// cálida del sol) — con un dejo crema hacia la base del pétalo.
const petalOuter = new THREE.Color('#fdfcf6');
const petalInner = new THREE.Color('#f2e8cc');
const stamenColor = new THREE.Color('#caa23a');

function paintUniform(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const count = geometry.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** Tira angosta de dos columnas que crece hacia +Y con un leve arqueo hacia
 * +Z — misma familia que la brizna de césped de Vegetation.tsx, pero larga y
 * con degradado de color propio, para que se lea como hoja de lirio. */
function buildBladeStrip(
  length: number,
  width: number,
  bow: number,
  segments: number,
  colorAt: (t: number) => THREE.Color,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colorArr: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const halfWidth = (width / 2) * (1 - t * 0.82);
    const y = length * t;
    const z = bow * Math.sin(t * Math.PI * 0.5);
    positions.push(-halfWidth, y, z, halfWidth, y, z);
    const c = colorAt(t);
    colorArr.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  // `mergeGeometries` exige que TODAS las geometrías compartan los mismos
  // atributos — el tallo/anteras (CylinderGeometry) traen `uv` de fábrica,
  // así que estas tiras a medida también necesitan uno (aunque no se use
  // para texturizar) o la fusión falla y tumba todo el <Canvas>.
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildLeaf(rng: () => number, length: number, width: number, segments: number): THREE.BufferGeometry {
  const bow = randomBetween(rng, 0.05, 0.16) * length;
  return buildBladeStrip(length, width, bow, segments, (t) => leafColorBase.clone().lerp(leafColorTip, 0.3 + t * 0.7));
}

/** Pétalo (tépalo) alargado: angosto en la base, se abre en el tercio medio
 * y cierra en punta — silueta de estrella típica del lirio, muy distinta del
 * rayo redondeado del girasol. */
function buildPetal(length: number, width: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colorArr: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const shape = Math.sin(Math.PI * Math.pow(Math.min(t, 1), 0.65));
    const halfWidth = (width / 2) * shape;
    const y = t * length;
    // Leve concavidad a lo largo del pétalo (como una cuchara chata), para
    // que no se vea como una lámina perfectamente plana.
    const cup = -Math.pow(1 - Math.min(Math.abs(t - 0.5) * 2, 1), 2) * width * 0.12;
    positions.push(-halfWidth, y, cup, halfWidth, y, cup);
    const c = petalInner.clone().lerp(petalOuter, Math.min(1, t * 1.2));
    colorArr.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Construye un lirio completo: hojas largas desde la base, tallo fino, y una
 * flor de tépalos blancos abiertos en forma de estrella con anteras chicas
 * en el centro (solo en el nivel de detalle cercano). Todo fusionado en una
 * única geometría — a esta escala, un balanceo de bloque entero es
 * indistinguible de uno articulado, así que no hace falta separar tallo y
 * flor como en el girasol.
 */
export function createLilyGeometry(seed: number, detail: LilyDetail): THREE.BufferGeometry {
  const cfg = DETAIL_CONFIG[detail];
  const rng = createSeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];

  const stemHeight = randomBetween(rng, 0.34, 0.44);

  // Hojas: nacen cerca de la base y suben en abanico alrededor del tallo.
  for (let i = 0; i < cfg.leafCount; i++) {
    const leafLength = stemHeight * randomBetween(rng, 0.55, 0.8);
    const leaf = buildLeaf(rng, leafLength, 0.035, cfg.leafSegments);
    leaf.rotateX(THREE.MathUtils.degToRad(-randomBetween(rng, 18, 38)));
    leaf.rotateY(rng() * Math.PI * 2);
    leaf.translate(0, stemHeight * randomBetween(rng, 0.02, 0.12), 0);
    parts.push(leaf);
  }

  // Tallo: un cilindro fino, apenas visible bajo las hojas y la flor.
  const stem = new THREE.CylinderGeometry(0.006, 0.01, stemHeight, 5);
  stem.translate(0, stemHeight / 2, 0);
  paintUniform(stem, leafColorBase.clone().lerp(leafColorTip, 0.4));
  parts.push(stem);

  // Flor: tépalos radiando desde la punta del tallo, abiertos hacia afuera
  // y arriba (nunca planos contra el tallo, como sí se abre un lirio real).
  const petalLength = randomBetween(rng, 0.09, 0.13);
  const petalWidth = petalLength * randomBetween(rng, 0.34, 0.44);
  const openAngle = randomBetween(rng, 40, 62);
  for (let i = 0; i < cfg.petalCount; i++) {
    const angle = (i / cfg.petalCount) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const petal = buildPetal(petalLength, petalWidth, 3);
    petal.rotateX(THREE.MathUtils.degToRad(-openAngle + (rng() - 0.5) * 8));
    petal.rotateY(angle);
    petal.translate(0, stemHeight, 0);
    parts.push(petal);
  }

  if (cfg.stamens) {
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + rng() * Math.PI * 2;
      const stamen = new THREE.CylinderGeometry(0.002, 0.003, petalLength * 0.5, 4);
      stamen.translate(0, (petalLength * 0.5) / 2, 0);
      stamen.rotateX(THREE.MathUtils.degToRad(-(openAngle - 12)));
      stamen.rotateY(angle);
      stamen.translate(0, stemHeight, 0);
      paintUniform(stamen, stamenColor);
      parts.push(stamen);
    }
  }

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  return merged;
}
