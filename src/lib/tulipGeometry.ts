import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from './colors';
import { createSeededRandom, randomBetween } from './random';

/**
 * Geometría del tulipán: tercera especie del campo, tan secundaria como el
 * lirio (`lilyGeometry.ts`) — mismo presupuesto de detalle, misma idea de
 * una sola malla fusionada por planta. La silueta es lo que lo distingue
 * del lirio: en vez de tépalos abiertos en estrella, el tulipán es una copa
 * cerrada — pétalos que se curvan hacia ADENTRO y apenas se abren en la
 * punta, en vez de abrirse hacia afuera.
 *
 * El color (rosa pastel o blanco cálido) se pinta la geometría en blanco
 * puro y se aplica vía `instanceColor` por instancia (mismo mecanismo que
 * el lirio y las florecitas silvestres) — así una sola geometría por nivel
 * de detalle sirve para ambos colores, elegidos como categoría discreta
 * (nunca mezclados a medias, para que cada flor se lea claramente rosa O
 * blanca, no de un rosa lavado intermedio).
 *
 * Pétalos y hojas usan la misma técnica de tira con sección curva
 * (`buildStrip`) que `sunflowerGeometry.ts`: la versión anterior generaba
 * cada tira con solo 2 columnas de ancho (sin ninguna subdivisión lateral),
 * así que era imposible que tuviera curvatura transversal — un plano
 * perfectamente recto es exactamente lo que se leía como "vectorizado". Con
 * varias columnas, un perfil de profundidad puede doblar la tira en una
 * sección cóncava (como una cuchara), que es lo que hace que un pétalo se
 * sienta con volumen en vez de ser una lámina plana con forma de rombo.
 */

export type TulipDetail = 'near' | 'far';

interface TulipDetailConfig {
  leafCount: number;
  leafLengthSegments: number;
  leafWidthSegments: number;
  petalLengthSegments: number;
  petalWidthSegments: number;
}

const DETAIL_CONFIG: Record<TulipDetail, TulipDetailConfig> = {
  near: { leafCount: 2, leafLengthSegments: 4, leafWidthSegments: 3, petalLengthSegments: 4, petalWidthSegments: 3 },
  far: { leafCount: 2, leafLengthSegments: 3, leafWidthSegments: 2, petalLengthSegments: 3, petalWidthSegments: 2 },
};

const leafColorBase = new THREE.Color(colors.stemDark);
const leafColorTip = new THREE.Color(colors.stem);

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

interface StripOptions {
  lengthSegments: number;
  widthSegments: number;
  length: number;
  widthProfile: (t: number) => number;
  /** Profundidad en Z (no altura en Y como en sunflowerGeometry.ts, porque
   * acá el eje de crecimiento de la tira es Y): combina el pliegue
   * longitudinal (curl/arqueo) con la concavidad transversal (cup/canal). */
  depthProfile: (t: number, u: number) => number;
  colorAt: (t: number, u: number) => THREE.Color;
}

/** Tira con sección curva: crece a lo largo de +Y desde el origen, con
 * varias columnas de ancho para poder doblarse en Z como una cuchara. Misma
 * técnica que `buildStrip` en `sunflowerGeometry.ts`, adaptada al eje Y
 * (allá el pétalo crece en Z; acá crece en Y porque nace de la punta del
 * tallo hacia arriba). */
function buildStrip(opts: StripOptions): THREE.BufferGeometry {
  const { lengthSegments, widthSegments, length, widthProfile, depthProfile, colorAt } = opts;
  const positions: number[] = [];
  const colorArr: number[] = [];

  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments;
    const halfWidth = widthProfile(t);
    const y = t * length;
    for (let j = 0; j <= widthSegments; j++) {
      const u = j / widthSegments;
      const x = (u - 0.5) * 2 * halfWidth;
      const z = depthProfile(t, u);
      positions.push(x, y, z);
      const c = colorAt(t, u);
      colorArr.push(c.r, c.g, c.b);
    }
  }

  const indices: number[] = [];
  const rowSize = widthSegments + 1;
  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < widthSegments; j++) {
      const a = i * rowSize + j;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  // `mergeGeometries` exige que TODAS las geometrías compartan los mismos
  // atributos — el tallo (CylinderGeometry) trae `uv` de fábrica, así que
  // estas tiras a medida también necesitan uno o la fusión falla y tumba
  // todo el <Canvas> (ya nos pasó exactamente esto con el lirio).
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Torsión progresiva a lo largo del eje de crecimiento (Y): rota el plano
 * X-Z un poco más cuanto más lejos de la base, dándole a la hoja o al
 * pétalo un leve giro en espiral en vez de crecer perfectamente recto y
 * plano — el mismo recurso que ya usa el tallo del girasol para verse
 * orgánico (`applyLengthTwist` en sunflowerGeometry.ts). */
function applyLengthTwist(geometry: THREE.BufferGeometry, length: number, twist: number) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = length > 0 ? THREE.MathUtils.clamp(pos.getY(i) / length, 0, 1) : 0;
    const a = twist * t;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setX(i, x * cos - z * sin);
    pos.setZ(i, x * sin + z * cos);
  }
  pos.needsUpdate = true;
}

/** Hoja de tulipán: ancha desde la base (nunca en punta de aguja, como sí
 * pasaba antes) y lanceolada — se afina recién cerca de la punta. La
 * concavidad transversal (canal central) es lo que la hace sentir como una
 * hoja doblada de verdad en vez de una tira plana. */
function buildLeaf(
  rng: () => number,
  length: number,
  width: number,
  lengthSegments: number,
  widthSegments: number,
): THREE.BufferGeometry {
  const bow = randomBetween(rng, 0.05, 0.13) * length;
  const twist = randomBetween(rng, -0.4, 0.4);

  const leaf = buildStrip({
    lengthSegments,
    widthSegments,
    length,
    widthProfile: (t) => {
      const rampIn = Math.min(t / 0.12, 1);
      const shape = Math.sin(Math.PI * Math.pow(Math.min(t, 1), 0.62));
      return (width / 2) * shape * rampIn;
    },
    depthProfile: (t, u) => {
      const bowZ = bow * Math.sin(t * Math.PI * 0.5);
      // Canal/nervadura central: los bordes se curvan levemente hacia
      // adelante respecto del centro, como una hoja real vista de perfil.
      const channel = Math.pow(Math.abs(u - 0.5) * 2, 2) * width * 0.11;
      return bowZ + channel;
    },
    colorAt: (t, u) => {
      const edge = Math.abs(u - 0.5) * 2;
      return leafColorBase
        .clone()
        .lerp(leafColorTip, 0.35 + t * 0.65)
        .offsetHSL(0, 0, -edge * 0.035 + (rng() - 0.5) * 0.015);
    },
  });

  applyLengthTwist(leaf, length, twist);
  leaf.computeVertexNormals();
  return leaf;
}

/** Pétalo/tépalo de tulipán: ANCHO desde la base (antes se afinaba en punta
 * en ambos extremos, como una lámina de almendra — la causa principal de
 * que se leyera como un triángulo/rombo geométrico) y redondeado en la
 * punta. La concavidad transversal (`cup`) es lo que le da sección de
 * cuchara; el pliegue hacia el centro (`curl`) es lo que cierra la copa. */
function buildPetal(
  length: number,
  width: number,
  curl: number,
  lengthSegments: number,
  widthSegments: number,
): THREE.BufferGeometry {
  return buildStrip({
    lengthSegments,
    widthSegments,
    length,
    widthProfile: (t) => {
      // Llega al ancho completo enseguida (14% del largo): una base angosta
      // en punta es lo que más delataba la forma "de aguja" anterior.
      const rampIn = Math.min(t / 0.14, 1);
      const rampOut = t > 0.5 ? Math.max(0, 1 - (t - 0.5) / 0.5) : 1;
      // Exponente bajo: redondea el cierre de la punta en vez de terminar
      // en un pico afilado.
      const shape = rampIn * Math.pow(rampOut, 0.55);
      return (width / 2) * shape;
    },
    depthProfile: (t, u) => {
      const inward = curl * t * t;
      const cup = Math.pow(Math.abs(u - 0.5) * 2, 2) * width * 0.18;
      return inward - cup;
    },
    colorAt: (t, u) => {
      // Sombreado falso (sin textura): el centro queda un poco más
      // luminoso que los bordes, reforzando la sensación de cuenco en vez
      // de depender solo de la normal — el mismo tipo de recurso barato que
      // ya usa el centro del girasol.
      const edge = Math.abs(u - 0.5) * 2;
      const shade = 1 - edge * 0.1 - t * 0.04;
      return new THREE.Color(shade, shade, shade);
    },
  });
}

/**
 * Construye un tulipán completo: dos hojas basales anchas, tallo fino, y
 * una copa de 6 pétalos curvados hacia adentro y apenas abiertos en la
 * punta. Cada pétalo de la corona tiene su propio largo/ancho/curvatura
 * (jitter independiente, no un único valor repetido para los 6) más una
 * torsión y una leve inclinación lateral propias — es lo que hace que
 * ningún pétalo, y por lo tanto ninguna flor, sea idéntico a otro. Todo en
 * blanco puro (el color real llega después vía `instanceColor`, ver
 * `Tulips.tsx`) salvo el tallo/hojas, que sí llevan su verde horneado como
 * el resto de las plantas del campo.
 */
export function createTulipGeometry(seed: number, detail: TulipDetail): THREE.BufferGeometry {
  const cfg = DETAIL_CONFIG[detail];
  const rng = createSeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];

  const stemHeight = randomBetween(rng, 0.22, 0.3);

  for (let i = 0; i < cfg.leafCount; i++) {
    const leafLength = stemHeight * randomBetween(rng, 0.6, 0.85);
    const leaf = buildLeaf(rng, leafLength, 0.05, cfg.leafLengthSegments, cfg.leafWidthSegments);
    leaf.rotateX(THREE.MathUtils.degToRad(-randomBetween(rng, 20, 42)));
    leaf.rotateY(rng() * Math.PI * 2);
    leaf.translate(0, stemHeight * randomBetween(rng, 0.0, 0.08), 0);
    parts.push(leaf);
  }

  // Un leve arqueo al propio tallo (como el del girasol): un tallo
  // perfectamente recto es otra señal de "objeto vectorial".
  const stemBend = randomBetween(rng, -0.06, 0.06);
  const stem = new THREE.CylinderGeometry(0.007, 0.011, stemHeight, 5);
  stem.translate(0, stemHeight / 2, 0);
  stem.rotateZ(stemBend);
  paintUniform(stem, leafColorBase.clone().lerp(leafColorTip, 0.45));
  parts.push(stem);

  // Copa: 6 pétalos en un solo anillo, casi verticales (openAngle chico) y
  // curvados hacia adentro — muy distinto del anillo abierto del lirio.
  const baseLength = randomBetween(rng, 0.075, 0.1);
  const baseWidth = baseLength * randomBetween(rng, 0.52, 0.64);
  const baseCurl = baseLength * randomBetween(rng, 0.35, 0.55);
  const baseOpenAngle = randomBetween(rng, 6, 16);
  const petalCount = 6;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    // Jitter propio por pétalo (no un único valor repetido 6 veces): es lo
    // que evita que la copa se vea como un molde perfectamente simétrico.
    const lengthJ = baseLength * randomBetween(rng, 0.88, 1.12);
    const widthJ = baseWidth * randomBetween(rng, 0.85, 1.18);
    const curlJ = baseCurl * randomBetween(rng, 0.75, 1.3);
    const openAngleJ = baseOpenAngle + (rng() - 0.5) * 7;
    // Inclinación lateral (roll) y torsión individuales: cada pétalo se
    // apoya en el vecino en un ángulo levemente distinto, en vez de un
    // abanico perfectamente uniforme.
    const rollJ = (rng() - 0.5) * 0.32;
    const twistJ = (rng() - 0.5) * 0.5;

    const petal = buildPetal(lengthJ, widthJ, curlJ, cfg.petalLengthSegments, cfg.petalWidthSegments);
    applyLengthTwist(petal, lengthJ, twistJ);
    petal.computeVertexNormals();
    petal.rotateZ(rollJ);
    petal.rotateX(THREE.MathUtils.degToRad(-openAngleJ));
    petal.rotateY(angle);
    petal.translate(0, stemHeight, 0);
    parts.push(petal);
  }

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  return merged;
}
