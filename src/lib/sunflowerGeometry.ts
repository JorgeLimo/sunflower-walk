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
  outerPetalCount: number;
  innerPetalCount: number;
  seedCount: number;
  domeRadialSegments: number;
}

const DETAIL_CONFIG: Record<SunflowerDetail, DetailConfig> = {
  high: {
    stemSegments: 4,
    stemRadialSegments: 8,
    leafCount: 4,
    leafSerration: 0.05,
    outerPetalCount: 24,
    innerPetalCount: 16,
    seedCount: 70,
    domeRadialSegments: 16,
  },
  medium: {
    stemSegments: 3,
    stemRadialSegments: 6,
    leafCount: 3,
    leafSerration: 0.035,
    outerPetalCount: 17,
    innerPetalCount: 11,
    seedCount: 34,
    domeRadialSegments: 12,
  },
  low: {
    stemSegments: 2,
    stemRadialSegments: 5,
    leafCount: 2,
    leafSerration: 0,
    outerPetalCount: 11,
    innerPetalCount: 0,
    seedCount: 0,
    domeRadialSegments: 8,
  },
};

interface MaturityConfig {
  headScale: number;
  openAngleDeg: number;
  petalLengthFactor: number;
}

const MATURITY_CONFIG: Record<SunflowerMaturity, MaturityConfig> = {
  mature: { headScale: 1, openAngleDeg: 8, petalLengthFactor: 1 },
  young: { headScale: 0.58, openAngleDeg: 42, petalLengthFactor: 0.62 },
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

function buildPetal(length: number, width: number, curl: number): THREE.BufferGeometry {
  return buildStrip({
    lengthSegments: 4,
    widthSegments: 3,
    length,
    // Forma de "rayo" alargado: se ensancha rápido cerca de la base, se
    // mantiene ancho durante buena parte del largo y recién en el último
    // tramo se afina hasta la punta — en vez de un rombo simétrico que se
    // infla y se achica parejo, que es lo que hacía ver los pétalos como
    // bultos superpuestos en vez de rayos individuales separados.
    widthProfile: (t) => {
      const rampIn = Math.min(t / 0.16, 1);
      const rampOut = t > 0.52 ? Math.max(0, 1 - (t - 0.52) / 0.48) : 1;
      const shape = rampIn * Math.pow(rampOut, 0.85);
      return (width / 2) * shape;
    },
    heightProfile: (t, u) => {
      const bend = -curl * t * t;
      const cup = Math.pow(Math.abs(u - 0.5) * 2, 2) * width * 0.08;
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
) {
  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2 + phaseOffset;
    // Jitter angular moderado: suficiente para que no sea un abanico
    // perfectamente uniforme, pero sin que los pétalos vecinos terminen
    // amontonados unos sobre otros.
    const jitter = (rng() - 0.5) * ((Math.PI * 2) / count) * 0.3;
    const angle = baseAngle + jitter;
    const lengthJ = length * (0.88 + rng() * 0.22);
    const widthJ = width * (0.85 + rng() * 0.25);
    const curlJ = curl * (0.75 + rng() * 0.4);
    const tiltJ = openAngleDeg + (rng() - 0.5) * 6;

    const petal = buildPetal(lengthJ, widthJ, curlJ);
    petal.rotateX(THREE.MathUtils.degToRad(-tiltJ));
    petal.translate(0, 0, radius);
    petal.rotateY(angle);
    parts.push(petal);
  }
}

function addCenterDome(parts: THREE.BufferGeometry[], radius: number, radialSegments: number) {
  const domeHeight = radius * 0.4;
  const ringSteps = 5;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= ringSteps; i++) {
    const t = i / ringSteps;
    const r = Math.max(radius * t, 0.001);
    const y = Math.max(domeHeight * (1 - t * t) * 0.9, 0);
    points.push(new THREE.Vector2(r, y));
  }
  const dome = new THREE.LatheGeometry(points, radialSegments);

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

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function addSeeds(parts: THREE.BufferGeometry[], count: number, maxRadius: number) {
  const domeHeight = maxRadius * 0.4 * 0.88;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const r = maxRadius * Math.sqrt(t) * 0.92;
    const angle = i * GOLDEN_ANGLE;
    const y = domeHeight * (1 - (r / maxRadius) * (r / maxRadius));
    const size = 0.013 + hash(i * 3.1) * 0.006;

    const seed = new THREE.ConeGeometry(size, size * 1.7, 5, 1);
    seed.translate(r * Math.cos(angle), y + size * 0.7, r * Math.sin(angle));

    const shade = 0.15 + hash(i * 7.7) * 0.35;
    const c = centerDarkColor.clone().lerp(new THREE.Color('#1c1108'), shade).offsetHSL(0, 0, (hash(i * 5.3) - 0.5) * 0.08);
    paintUniformColor(seed, c);
    parts.push(seed);
  }
}

function buildLeaf(rng: () => number, length: number, width: number, serration: number, droop: number, elevationDeg: number): THREE.BufferGeometry {
  const geo = buildStrip({
    lengthSegments: 5,
    widthSegments: 4,
    length,
    widthProfile: (t) => {
      const ramp = t < 0.1 ? t / 0.1 : 1;
      const shape = Math.sin(Math.PI * Math.pow(Math.min(t, 1), 0.6));
      return (width / 2) * shape * ramp;
    },
    heightProfile: (t, u) => {
      const sag = -droop * Math.pow(t, 1.4);
      const cup = Math.pow(Math.abs(u - 0.5) * 2, 2) * width * 0.08;
      return sag + cup;
    },
    serration,
    colorAt: (_t, u) => {
      const edge = Math.abs(u - 0.5) * 2;
      return stemDarkColor.clone().lerp(stemColor, 0.35 + edge * 0.5 + rng() * 0.02);
    },
  });
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
  const bendAmount = 0.16 + rng() * 0.14;
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
    const attachY = stemHeight * (0.16 + along * 0.58);
    const angleAround = rng() * Math.PI * 2;
    const sizeFactor = (1.2 - along * 0.5) * mat.headScale ** 0.5 * (0.85 + rng() * 0.3);
    const leafLength = (0.3 + rng() * 0.1) * sizeFactor;
    const leafWidth = (0.16 + rng() * 0.05) * sizeFactor;

    const orientationRoll = rng();
    const elevationDeg =
      orientationRoll < 0.3
        ? randomBetween(rng, -12, 8) // colgando, apuntando levemente hacia el suelo
        : orientationRoll < 0.7
          ? randomBetween(rng, 15, 35) // hacia los lados
          : randomBetween(rng, 38, 60); // hacia arriba
    const droop = orientationRoll < 0.3 ? randomBetween(rng, 0.22, 0.34) : randomBetween(rng, 0.08, 0.18);

    const leaf = buildLeaf(rng, leafLength, leafWidth, cfg.leafSerration, droop, elevationDeg);
    leaf.rotateY(angleAround);
    leaf.translate(0, attachY, 0);
    parts.push(leaf);
  }

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
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
  const faceTilt = Math.PI * 0.4;
  const headScale = mat.headScale;

  const outerRadius = 0.4 * headScale;
  const innerRadius = 0.24 * headScale;
  const domeRadius = 0.19 * headScale;

  // Ligera variación de cantidad de pétalos por variante (no por instancia,
  // ya que la geometría se comparte vía InstancedMesh) para que no todas
  // las flores de un mismo nivel de detalle luzcan idénticas en conteo.
  const outerPetalCount = Math.max(6, cfg.outerPetalCount + Math.round((rng() - 0.5) * 6));
  const innerPetalCount = cfg.innerPetalCount > 0 ? Math.max(5, cfg.innerPetalCount + Math.round((rng() - 0.5) * 4)) : 0;

  addPetalRing(
    parts,
    rng,
    outerPetalCount,
    outerRadius,
    0.4 * headScale * mat.petalLengthFactor,
    0.115 * headScale,
    0.22 * headScale,
    mat.openAngleDeg,
    0,
  );

  if (innerPetalCount > 0) {
    addPetalRing(
      parts,
      rng,
      innerPetalCount,
      innerRadius,
      0.24 * headScale * mat.petalLengthFactor,
      0.078 * headScale,
      0.14 * headScale,
      mat.openAngleDeg + 12,
      Math.PI / innerPetalCount,
    );
  }

  addCenterDome(parts, domeRadius, cfg.domeRadialSegments);

  if (cfg.seedCount > 0) {
    addSeeds(parts, cfg.seedCount, domeRadius);
  }

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  merged.rotateX(faceTilt);
  merged.translate(0, 0.02, 0.06);
  return merged;
}
