import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from './colors';
import { createSeededRandom, randomBetween } from './random';

/**
 * Construye las geometrías de girasol estilizado. Cada girasol se divide en
 * DOS mallas fusionadas (tallo+hojas, y cabeza+pétalos) en lugar de una sola,
 * para que el viento pueda mover la cabeza de forma independiente del tallo
 * (con retraso/rebote propio) en vez de rotar toda la planta como un bloque
 * rígido. Ambas geometrías se generan una única vez por variante y se
 * reutilizan en un InstancedMesh.
 */

export type SunflowerDetail = 'high' | 'medium' | 'low';
export type SunflowerMaturity = 'mature' | 'young';

export const STEM_HEIGHT_BY_MATURITY: Record<SunflowerMaturity, number> = {
  mature: 1.6,
  young: 0.85,
};

interface DetailConfig {
  stemSegments: number;
  stemRadialSegments: number;
  leafCount: number;
  leafSerration: number;
  leafSegments: { length: number; width: number };
  outerPetalCount: number;
  innerPetalCount: number;
  petalSegments: { length: number; width: number };
  seedCount: number;
  domeRadialSegments: number;
  /** Anillos del domo de semillas. En la distancia el domo es un punto: sus
   * anillos son triángulos que nadie llega a distinguir. */
  domeRings: number;
  /** Brácteas (sépalos verdes) detrás de la corona de pétalos. Muchas flores
   * del campo se ven de costado o de espaldas: sin ellas, esas plantas
   * mostraban solo la cara oscura del disco. 0 las desactiva (fondo). */
  bractCount: number;
}

// Presupuesto por nivel de detalle. El campo pasó a tener MUCHÍSIMAS más
// plantas que antes, así que los niveles medio y bajo se adelgazaron a
// propósito (menos pétalos, menos segmentos, sin semillas sueltas): a esa
// distancia no se distinguen los detalles, pero sí se notan en el conteo de
// triángulos multiplicado por cientos de instancias.
const DETAIL_CONFIG: Record<SunflowerDetail, DetailConfig> = {
  high: {
    stemSegments: 4,
    stemRadialSegments: 7,
    leafCount: 5,
    leafSerration: 0.06,
    leafSegments: { length: 5, width: 3 },
    outerPetalCount: 26,
    innerPetalCount: 14,
    petalSegments: { length: 4, width: 2 },
    seedCount: 18,
    domeRadialSegments: 12,
    domeRings: 5,
    bractCount: 9,
  },
  medium: {
    stemSegments: 3,
    stemRadialSegments: 4,
    leafCount: 3,
    leafSerration: 0.04,
    leafSegments: { length: 3, width: 1 },
    outerPetalCount: 11,
    innerPetalCount: 5,
    petalSegments: { length: 3, width: 1 },
    seedCount: 0,
    domeRadialSegments: 7,
    domeRings: 2,
    bractCount: 3,
  },
  low: {
    stemSegments: 2,
    stemRadialSegments: 3,
    leafCount: 1,
    leafSerration: 0,
    leafSegments: { length: 2, width: 1 },
    outerPetalCount: 6,
    innerPetalCount: 0,
    petalSegments: { length: 3, width: 1 },
    seedCount: 0,
    domeRadialSegments: 5,
    domeRings: 2,
    bractCount: 0,
  },
};

interface MaturityConfig {
  headScale: number;
  openAngleDeg: number;
  petalLengthFactor: number;
}

const MATURITY_CONFIG: Record<SunflowerMaturity, MaturityConfig> = {
  mature: { headScale: 1, openAngleDeg: 26, petalLengthFactor: 1 },
  young: { headScale: 0.58, openAngleDeg: 62, petalLengthFactor: 0.5 },
};

const stemColor = new THREE.Color(colors.stem);
const stemDarkColor = new THREE.Color(colors.stemDark);
const petalColor = new THREE.Color(colors.petal);
const petalShadowColor = new THREE.Color(colors.petalShadow);
const centerColor = new THREE.Color(colors.flowerCenter);
const centerDarkColor = new THREE.Color(colors.flowerCenterDark);

/** Ruido de valor barato y determinístico (sin dependencias externas). */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

function perturbRadial(geometry: THREE.BufferGeometry, amount: number, seedOffset: number) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const radius = Math.sqrt(x * x + z * z);
    if (radius < 1e-6) continue;
    const angle = Math.atan2(z, x);
    const n = hash(angle * 3.1 + seedOffset) * 2 - 1;
    const scale = 1 + n * amount;
    pos.setX(i, x * scale);
    pos.setZ(i, z * scale);
  }
  pos.needsUpdate = true;
}

function paintUniformColor(geometry: THREE.BufferGeometry, color: THREE.Color) {
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
  heightProfile: (t: number, u: number) => number;
  serration: number;
  colorAt: (t: number, u: number) => THREE.Color;
}

/**
 * Genera una tira rectangular curvada (grilla de vértices) que se usa como
 * base tanto para pétalos como para hojas: crece a lo largo de +Z desde el
 * punto de inserción (origen) y se puede doblar/ahusar por perfil.
 */
function buildStrip(opts: StripOptions): THREE.BufferGeometry {
  const { lengthSegments, widthSegments, length, widthProfile, heightProfile, serration, colorAt } = opts;
  const positions: number[] = [];
  const colorArr: number[] = [];

  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments;
    let halfWidth = widthProfile(t);
    if (serration > 0 && t > 0.1) {
      halfWidth = Math.max(0, halfWidth + Math.sin(t * 46) * serration * halfWidth);
    }
    for (let j = 0; j <= widthSegments; j++) {
      const u = j / widthSegments;
      const x = (u - 0.5) * 2 * halfWidth;
      const y = heightProfile(t, u);
      const z = t * length;
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
  geo.setIndex(indices);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/** Torsión progresiva alrededor del eje largo del pétalo (post-proceso, sin
 * sumar vértices): la punta queda girada respecto de la base, que es lo que
 * hace que un pétalo real nunca se lea como una lámina plana recortada. */
function applyLengthTwist(geometry: THREE.BufferGeometry, length: number, twist: number) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = length > 0 ? THREE.MathUtils.clamp(pos.getZ(i) / length, 0, 1) : 0;
    const a = twist * t;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setX(i, x * cos - y * sin);
    pos.setY(i, x * sin + y * cos);
  }
  pos.needsUpdate = true;
}

function buildPetal(length: number, width: number, curl: number, segments: { length: number; width: number }): THREE.BufferGeometry {
  return buildStrip({
    lengthSegments: segments.length,
    widthSegments: segments.width,
    length,
    // Forma de "rayo" alargado: se ensancha rápido cerca de la base, se
    // mantiene ancho durante buena parte del largo y recién hacia la punta
    // se afina — pero con un exponente bajo (antes 0.85, ahora 0.55) para
    // que el cierre final sea redondeado tipo espátula, no un triángulo que
    // termina en una punta de aguja.
    widthProfile: (t) => {
      // Llega al ancho completo enseguida (8% del largo, antes 16%) para
      // que no quede una base angosta justo donde más se nota el hueco con
      // el pétalo vecino.
      const rampIn = Math.min(t / 0.08, 1);
      const rampOut = t > 0.58 ? Math.max(0, 1 - (t - 0.58) / 0.42) : 1;
      // Exponente moderado (antes 0.85): redondea la punta del pétalo (menos
      // "triangular") sin llegar a solaparse tanto con el vecino.
      const shape = rampIn * Math.pow(rampOut, 0.68);
      return (width / 2) * shape;
    },
    heightProfile: (t, u) => {
      // Algo más de curvatura/volumen que el original (0.08).
      const bend = -curl * t * t;
      const cup = Math.pow(Math.abs(u - 0.5) * 2, 2) * width * 0.095;
      return bend + cup;
    },
    serration: 0,
    colorAt: (t) => petalShadowColor.clone().lerp(petalColor, Math.min(1, t * 1.15)),
  });
}

function addPetalRing(
  parts: THREE.BufferGeometry[],
  rng: () => number,
  count: number,
  radius: number,
  length: number,
  width: number,
  curl: number,
  openAngleDeg: number,
  phaseOffset: number,
  segments: { length: number; width: number },
) {
  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2 + phaseOffset;
    // Jitter angular moderado: suficiente para que no sea un abanico
    // perfectamente uniforme, pero sin que los pétalos vecinos terminen
    // amontonados unos sobre otros ni dejen huecos grandes entre sí.
    const jitter = (rng() - 0.5) * ((Math.PI * 2) / count) * 0.2;
    const angle = baseAngle + jitter;
    const lengthJ = length * (0.88 + rng() * 0.22);
    // Nunca más angosto que el 95% del ancho base (antes bajaba a 85%): un
    // pétalo demasiado angosto combinado con el jitter angular es lo que
    // dejaba ver espacios de fondo entre pétalos vecinos.
    const widthJ = width * (0.95 + rng() * 0.25);
    const curlJ = curl * (0.75 + rng() * 0.4);
    const tiltJ = openAngleDeg + (rng() - 0.5) * 22;
    // Leve inclinación lateral individual (roll) — el detalle que más ayuda
    // a que ningún pétalo se vea idéntico a su vecino.
    const rollJ = (rng() - 0.5) * 0.18;

    const petal = buildPetal(lengthJ, widthJ, curlJ, segments);
    // Torsión moderada: girada en exceso, la lámina del pétalo se pone de
    // canto y deja ver el fondo entre pétalo y pétalo.
    applyLengthTwist(petal, lengthJ, (rng() - 0.5) * 0.4);
    petal.rotateZ(rollJ);
    petal.rotateX(THREE.MathUtils.degToRad(-tiltJ));
    petal.translate(0, 0, radius);
    petal.rotateY(angle);
    parts.push(petal);
  }
}

function addCenterDome(parts: THREE.BufferGeometry[], radius: number, radialSegments: number, ringSteps: number, seed: number) {
  const domeHeight = radius * 0.4;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= ringSteps; i++) {
    const t = i / ringSteps;
    const r = Math.max(radius * t, 0.001);
    const y = Math.max(domeHeight * (1 - t * t) * 0.9, 0);
    points.push(new THREE.Vector2(r, y));
  }
  const dome = new THREE.LatheGeometry(points, radialSegments);
  // Perturbación radial sutil (mismo truco que el tallo): sin esto, el
  // disco de semillas es un círculo perfecto visto desde arriba, lo que se
  // nota como "demasiado geométrico" incluso con las semillas encima.
  perturbRadial(dome, 0.06, seed);

  const pos = dome.attributes.position;
  const colorArr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z) / radius;
    const speck = (hash(x * 91.7 + z * 57.3) - 0.5) * 0.12;
    const c = centerDarkColor.clone().lerp(centerColor, Math.min(1, r * 1.1)).offsetHSL(0, 0, speck);
    colorArr[i * 3] = c.r;
    colorArr[i * 3 + 1] = c.g;
    colorArr[i * 3 + 2] = c.b;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
  parts.push(dome);
}

/** Corona de brácteas (los sépalos verdes puntiagudos que rodean el disco
 * por detrás) y receptáculo que cierra la parte trasera de la cabeza. Sin
 * esto, las flores que miran en dirección contraria a la cámara —que son
 * muchas en un campo— mostraban el interior hueco y oscuro del disco. */
function addBracts(parts: THREE.BufferGeometry[], rng: () => number, count: number, radius: number, headScale: number) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const length = (0.13 + rng() * 0.06) * headScale;
    const width = (0.095 + rng() * 0.04) * headScale;

    const bract = buildStrip({
      lengthSegments: 2,
      widthSegments: 2,
      length,
      widthProfile: (t) => (width / 2) * Math.sin(Math.PI * Math.pow(Math.min(t, 1), 0.45)),
      heightProfile: (t, u) => Math.pow(Math.abs(u - 0.5) * 2, 2) * width * 0.12 - 0.05 * t * t,
      serration: 0,
      colorAt: (t) => stemDarkColor.clone().lerp(stemColor, 0.2 + t * 0.4),
    });
    // Se abren hacia afuera y hacia abajo, por detrás de la corona de pétalos.
    bract.rotateX(THREE.MathUtils.degToRad(26 + rng() * 22));
    bract.translate(0, -0.015 * headScale, radius);
    bract.rotateY(angle);
    parts.push(bract);
  }
}

function addReceptacle(parts: THREE.BufferGeometry[], radius: number, radialSegments: number) {
  const height = radius * 0.95;
  const cap = new THREE.ConeGeometry(radius * 0.92, height, radialSegments, 1);
  cap.rotateX(Math.PI);
  cap.translate(0, -height / 2, 0);
  paintUniformColor(cap, stemDarkColor.clone().lerp(stemColor, 0.3));
  parts.push(cap);
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function addSeeds(parts: THREE.BufferGeometry[], count: number, maxRadius: number) {
  const domeHeight = maxRadius * 0.4 * 0.88;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const r = maxRadius * Math.sqrt(t) * 0.92;
    const angle = i * GOLDEN_ANGLE;
    const y = domeHeight * (1 - (r / maxRadius) * (r / maxRadius));
    // Las flósculos crecen hacia el borde del disco (en el centro están
    // recién formados): tamaño ligado al radio, no puramente aleatorio.
    const size = (0.011 + hash(i * 3.1) * 0.005) * (0.72 + 0.55 * (r / maxRadius));

    const seed = new THREE.ConeGeometry(size, size * 1.7, 4, 1);
    seed.translate(r * Math.cos(angle), y + size * 0.7, r * Math.sin(angle));

    const shade = 0.15 + hash(i * 7.7) * 0.35;
    const c = centerDarkColor.clone().lerp(new THREE.Color('#1c1108'), shade).offsetHSL(0, 0, (hash(i * 5.3) - 0.5) * 0.08);
    paintUniformColor(seed, c);
    parts.push(seed);
  }
}

/** Aplica un leve arqueo lateral (post-proceso sobre las posiciones ya
 * generadas, sin sumar vértices): cada hoja se curva un poco hacia un lado
 * y vuelve hacia el centro cerca de la punta, en vez de crecer perfectamente
 * recta como una tira simétrica. */
function applyLateralBend(geometry: THREE.BufferGeometry, length: number, bendAmount: number) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = length > 0 ? THREE.MathUtils.clamp(pos.getZ(i) / length, 0, 1) : 0;
    pos.setX(i, pos.getX(i) + Math.sin(t * Math.PI) * bendAmount);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

function buildLeaf(
  rng: () => number,
  length: number,
  width: number,
  serration: number,
  droop: number,
  elevationDeg: number,
  segments: { length: number; width: number },
): THREE.BufferGeometry {
  const geo = buildStrip({
    lengthSegments: segments.length,
    widthSegments: segments.width,
    length,
    widthProfile: (t) => {
      // Hoja cordada (acorazonada), como la del girasol real: ancha casi
      // desde el arranque, con los "hombros" en el primer tercio y después
      // una punta larga — antes el ancho máximo caía más adelante y la hoja
      // se leía como una tira simétrica.
      const ramp = t < 0.06 ? t / 0.06 : 1;
      const shape = Math.sin(Math.PI * Math.pow(Math.min(t, 1), 0.5));
      return (width / 2) * shape * ramp;
    },
    heightProfile: (t, u) => {
      const sag = -droop * Math.pow(t, 1.4);
      // Canal central más marcado que antes (0.08 → 0.12): se lee como el
      // nervio central de la hoja en vez de un simple pliegue sutil.
      const cup = Math.pow(Math.abs(u - 0.5) * 2, 2) * width * 0.22;
      return sag + cup;
    },
    serration,
    colorAt: (_t, u) => {
      const edge = Math.abs(u - 0.5) * 2;
      return stemDarkColor.clone().lerp(stemColor, 0.35 + edge * 0.5 + rng() * 0.02);
    },
  });
  // Arqueo lateral aleatorio (a veces hacia un lado, a veces hacia el
  // otro): esto es lo que evita que todas las hojas se lean como tiras
  // simétricas idénticas.
  applyLateralBend(geo, length, (rng() - 0.5) * length * 0.35);
  geo.rotateX(THREE.MathUtils.degToRad(-elevationDeg));
  return geo;
}

function paintStemSegment(geometry: THREE.BufferGeometry, t: number) {
  const base = stemColor.clone().lerp(stemDarkColor, 0.15 + 0.1 * Math.sin(t * 10));
  const count = geometry.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const jitter = (hash(i * 0.37 + t * 91.7) - 0.5) * 0.08;
    const c = base.clone().offsetHSL(0, 0, jitter);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/**
 * Tallo + hojas, con el origen local en el punto donde nace de la tierra
 * (así el InstancedMesh puede rotarlo/escalarlo como una planta enraizada).
 */
export function createSunflowerStemGeometry(seed: number, detail: SunflowerDetail, maturity: SunflowerMaturity): THREE.BufferGeometry {
  const cfg = DETAIL_CONFIG[detail];
  const mat = MATURITY_CONFIG[maturity];
  const rng = createSeededRandom(seed);
  const stemHeight = STEM_HEIGHT_BY_MATURITY[maturity];
  const parts: THREE.BufferGeometry[] = [];

  const segments = cfg.stemSegments;
  const segHeight = stemHeight / segments;
  // Curva contenida: la punta del tallo se aparta de la vertical de forma
  // acumulativa, así que valores altos alejaban mucho el extremo del eje.
  const bendAmount = 0.1 + rng() * 0.14;
  const bendDir = rng() * Math.PI * 2;
  const tiltAxis = new THREE.Vector3(Math.cos(bendDir), 0, Math.sin(bendDir));
  const baseRadius = 0.05;
  const tipRadius = 0.016;

  const cumulativeQuat = new THREE.Quaternion();
  const cursor = new THREE.Vector3(0, 0, 0);

  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const r0 = THREE.MathUtils.lerp(baseRadius, tipRadius, t0);
    const r1 = THREE.MathUtils.lerp(baseRadius, tipRadius, t1);

    const seg = new THREE.CylinderGeometry(r1, r0, segHeight, cfg.stemRadialSegments, 1);
    perturbRadial(seg, 0.05, seed + i * 17.3);
    seg.translate(0, segHeight / 2, 0);

    const localTilt = bendAmount * Math.sin(((i + 0.5) / segments) * Math.PI);
    const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tiltAxis, localTilt);
    cumulativeQuat.multiply(tiltQuat);

    seg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(cumulativeQuat));
    seg.translate(cursor.x, cursor.y, cursor.z);
    paintStemSegment(seg, t0);
    parts.push(seg);

    const tipLocal = new THREE.Vector3(0, segHeight, 0).applyQuaternion(cumulativeQuat);
    cursor.add(tipLocal);
  }

  // Cada hoja elige al azar una de tres "actitudes" (colgando, hacia el
  // lado, hacia arriba) y un ángulo alrededor del tallo totalmente libre —
  // así una misma planta mezcla hojas mirando en direcciones distintas en
  // vez de repetir siempre el mismo par simétrico a izquierda/derecha.
  const leafCount = Math.max(2, cfg.leafCount + Math.round((rng() - 0.5) * 2.2));
  for (let i = 0; i < leafCount; i++) {
    const along = (i + 1) / (leafCount + 1);
    const attachY = stemHeight * (0.14 + along * 0.66);
    // Ángulo áureo (137.5°) como en la filotaxis real, con un jitter chico:
    // repartir al azar dejaba lados del tallo completamente pelados y hacía
    // que la planta se viera incompleta.
    const angleAround = i * 2.39996 + (rng() - 0.5) * 0.5;
    const sizeFactor = (1.2 - along * 0.5) * mat.headScale ** 0.5 * (0.85 + rng() * 0.3);
    // Hojas claramente más grandes que antes: con las plantas ya reducidas de
    // escala, unas hojas pequeñas dejaban tallos casi pelados con una cabeza
    // encima (efecto "piruleta"). El follaje es también lo que da masa verde
    // al campo visto de lejos.
    const leafLength = (0.36 + rng() * 0.12) * sizeFactor;
    const leafWidth = (0.27 + rng() * 0.08) * sizeFactor;

    const orientationRoll = rng();
    const elevationDeg =
      orientationRoll < 0.3
        ? randomBetween(rng, -12, 8) // colgando, apuntando levemente hacia el suelo
        : orientationRoll < 0.7
          ? randomBetween(rng, 15, 35) // hacia los lados
          : randomBetween(rng, 38, 60); // hacia arriba
    const droop = orientationRoll < 0.3 ? randomBetween(rng, 0.3, 0.46) : randomBetween(rng, 0.13, 0.25);

    const leaf = buildLeaf(rng, leafLength, leafWidth, cfg.leafSerration, droop, elevationDeg, cfg.leafSegments);
    leaf.rotateY(angleAround);
    leaf.translate(0, attachY, 0);
    parts.push(leaf);
  }

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  // La punta del tallo NO está en (0, stemHeight, 0): al curvarse, el extremo
  // queda más bajo y desplazado de lado. Quien coloque la cabeza encima tiene
  // que usar estos valores, o la flor aparece flotando separada del tallo.
  merged.userData.tip = cursor.clone();
  // Amortiguada (~75%): la cabeza acompaña la curva del tallo sin llegar a
  // quedar tumbada en las plantas con más curvatura.
  merged.userData.tipQuat = new THREE.Quaternion().slerp(cumulativeQuat, 0.75);
  return merged;
}

/**
 * Pétalos + centro, con el origen local en el punto de inserción sobre el
 * tallo (la punta), para poder posicionarlo en la punta ya doblada del tallo
 * y darle un balanceo propio independiente en cada frame.
 */
export function createSunflowerHeadGeometry(seed: number, detail: SunflowerDetail, maturity: SunflowerMaturity): THREE.BufferGeometry {
  const cfg = DETAIL_CONFIG[detail];
  const mat = MATURITY_CONFIG[maturity];
  const rng = createSeededRandom(seed + 500);
  const parts: THREE.BufferGeometry[] = [];
  // La cara mira ~40° hacia arriba (girasol real buscando el sol) en vez de
  // casi horizontal: además de ser más natural, evita que las plantas cuya
  // rotación las deja de perfil se vean como una astilla plana.
  const faceTilt = Math.PI * 0.3 + (rng() - 0.5) * 0.18;
  const headScale = mat.headScale;

  // El disco de semillas mide `domeRadius`. Los pétalos se insertan por
  // DENTRO de ese borde y crecen hacia afuera, de modo que sus bases quedan
  // tapadas por el reborde del disco. Antes se insertaban en 0.24 y 0.40
  // contra un disco de 0.19: entre el borde del disco y el primer pétalo
  // quedaba un anillo literalmente vacío, y el centro se leía como una
  // esfera apoyada encima de otra cosa en vez de una sola flor.
  const domeRadius = 0.19 * headScale;
  const outerRadius = 0.17 * headScale;
  const innerRadius = 0.105 * headScale;

  // Ligera variación de cantidad de pétalos por variante (no por instancia,
  // ya que la geometría se comparte vía InstancedMesh) para que no todas
  // las flores de un mismo nivel de detalle luzcan idénticas en conteo.
  // Margen de variación amplio a propósito: cada "estilo" de una misma franja
  // (ver SEED_BY_VARIANT en Sunflowers.tsx) recibe una semilla distinta, así
  // que este jitter es lo que hace que dos plantas vecinas no compartan el
  // mismo número de pétalos ni la misma silueta.
  const outerPetalCount = Math.max(6, cfg.outerPetalCount + Math.round((rng() - 0.5) * 7));
  const innerPetalCount = cfg.innerPetalCount > 0 ? Math.max(4, cfg.innerPetalCount + Math.round((rng() - 0.5) * 6)) : 0;

  addPetalRing(
    parts,
    rng,
    outerPetalCount,
    outerRadius,
    0.34 * headScale * mat.petalLengthFactor,
    0.105 * headScale,
    0.16 * headScale,
    mat.openAngleDeg,
    0,
    cfg.petalSegments,
  );

  if (innerPetalCount > 0) {
    addPetalRing(
      parts,
      rng,
      innerPetalCount,
      innerRadius,
      0.21 * headScale * mat.petalLengthFactor,
      0.088 * headScale,
      0.1 * headScale,
      mat.openAngleDeg + 12,
      Math.PI / innerPetalCount,
      cfg.petalSegments,
    );
  }

  addCenterDome(parts, domeRadius, cfg.domeRadialSegments, cfg.domeRings, seed);
  // El receptáculo solo existe donde el dorso de la flor llega a verse.
  if (cfg.bractCount > 0) addReceptacle(parts, domeRadius, cfg.domeRadialSegments);

  if (cfg.seedCount > 0) {
    addSeeds(parts, cfg.seedCount, domeRadius);
  }
  if (cfg.bractCount > 0) {
    addBracts(parts, rng, cfg.bractCount, domeRadius * 0.9, headScale);
  }

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  merged.rotateX(faceTilt);
  merged.translate(0, 0.01, 0.02);
  return merged;
}
