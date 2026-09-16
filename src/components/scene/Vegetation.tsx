import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from '../../lib/colors';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { ROAD_WIDTH, TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import type { VegetationTierCounts } from '../../lib/viewport';

interface BushLocal {
  x: number;
  z: number;
  scale: number;
  rotationY: number;
}

function generateBushes(index: number, count: number): BushLocal[] {
  const random = createSeededRandom(index * 5153 + 37);
  const out: BushLocal[] = [];
  for (let i = 0; i < count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    out.push({
      x: side * randomBetween(random, ROAD_WIDTH / 2 + 0.6, ROAD_WIDTH / 2 + 6),
      z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
      // Más chicos que antes: al reducir la escala de los girasoles, unos
      // arbustos grandes pasaban a competir con ellos por la atención.
      scale: randomBetween(random, 0.22, 0.46),
      rotationY: random() * Math.PI * 2,
    });
  }
  return out;
}

interface RockLocal {
  x: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotationY: number;
  rotationX: number;
}

/** Piedras bajas y poco frecuentes: rompen la monotonía del césped sin
 * competir con los girasoles. Escala no uniforme por eje (en vez de una
 * esfera pareja) para que cada una se lea como una piedra irregular en vez
 * de una bolita perfecta. */
function generateRocks(index: number, count: number): RockLocal[] {
  const random = createSeededRandom(index * 3491 + 61);
  const out: RockLocal[] = [];
  for (let i = 0; i < count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    const base = randomBetween(random, 0.13, 0.34);
    out.push({
      x: side * randomBetween(random, ROAD_WIDTH / 2 + 0.4, ROAD_WIDTH / 2 + 11),
      z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
      scaleX: base * randomBetween(random, 0.8, 1.3),
      scaleY: base * randomBetween(random, 0.55, 0.85),
      scaleZ: base * randomBetween(random, 0.8, 1.3),
      rotationY: random() * Math.PI * 2,
      rotationX: randomBetween(random, -0.2, 0.2),
    });
  }
  return out;
}

interface WildflowerLocal {
  x: number;
  z: number;
  scale: number;
  rotationY: number;
  tint: number;
}

/** Florecitas silvestres a ras de césped: solo puntos de color (blanco a
 * amarillo pálido) esparcidos entre los girasoles, nunca dentro de la franja
 * más cercana al camino (ahí ya hay girasoles de primer plano bien
 * detallados — sumar flores justo ahí solo generaría ruido visual). */
function generateWildflowers(index: number, count: number): WildflowerLocal[] {
  const random = createSeededRandom(index * 9227 + 13);
  const out: WildflowerLocal[] = [];
  for (let i = 0; i < count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    out.push({
      x: side * randomBetween(random, ROAD_WIDTH / 2 + 1.4, ROAD_WIDTH / 2 + 38),
      z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
      scale: randomBetween(random, 0.7, 1.2),
      rotationY: random() * Math.PI * 2,
      // 0 = blanco, 1 = amarillo pálido — variedad barata vía instanceColor
      // en vez de dos geometrías/materiales distintos.
      tint: random(),
    });
  }
  return out;
}

interface GrassLocal {
  x: number;
  z: number;
  scale: number;
  rotationY: number;
}

/** Matas de hierba baja pegadas al camino: es justo la franja donde más se
 * notaba el césped liso y vacío entre el borde del camino y los primeros
 * girasoles. Van sin sombra propia (son diminutas) pero sí la reciben. */
function generateGrass(index: number, count: number): GrassLocal[] {
  const random = createSeededRandom(index * 6421 + 97);
  const out: GrassLocal[] = [];
  for (let i = 0; i < count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    out.push({
      x: side * randomBetween(random, ROAD_WIDTH / 2 + 0.1, ROAD_WIDTH / 2 + 10),
      z: randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
      scale: randomBetween(random, 0.7, 1.55),
      rotationY: random() * Math.PI * 2,
    });
  }
  return out;
}

/** Una brizna: tira ahusada de 3 filas que se inclina hacia adelante. */
function buildGrassBlade(height: number, width: number, lean: number, sway: number): THREE.BufferGeometry {
  const rows = 3;
  const positions: number[] = [];
  const colorArr: number[] = [];
  const base = new THREE.Color(colors.stemDark);
  const tip = new THREE.Color(colors.stem);

  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const halfWidth = (width / 2) * Math.pow(1 - t, 1.2);
    const y = height * t;
    const z = lean * t * t;
    const drift = sway * t * t;
    positions.push(-halfWidth + drift, y, z, halfWidth + drift, y, z);
    const c = base.clone().lerp(tip, 0.25 + t * 0.75);
    colorArr.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }

  const indices: number[] = [];
  for (let i = 0; i < rows; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const grassGeometry = (() => {
  const random = createSeededRandom(8123);
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const blade = buildGrassBlade(
      randomBetween(random, 0.16, 0.3),
      randomBetween(random, 0.035, 0.055),
      randomBetween(random, 0.05, 0.13),
      randomBetween(random, -0.04, 0.04),
    );
    blade.rotateY(random() * Math.PI * 2);
    blade.translate(randomBetween(random, -0.05, 0.05), 0, randomBetween(random, -0.05, 0.05));
    blades.push(blade);
  }
  const merged = mergeGeometries(blades, false);
  merged.computeVertexNormals();
  return merged;
})();

const bushGeometry = new THREE.SphereGeometry(1, 7, 5);
const rockGeometry = new THREE.IcosahedronGeometry(1, 0);

function paintSolid(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const count = geometry.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

// Florecita mínima: un tallito fino + una cabeza achatada, fusionados en una
// sola geometría (mismo patrón que sunflowerGeometry.ts) para que sea UNA
// instancia por flor. El tallo se pinta verde y la cabeza blanca; el tinte
// final (blanco→amarillo pálido) se aplica por instancia vía
// `instanceColor`, que multiplica este blanco base.
const wildflowerGeometry = (() => {
  const stem = new THREE.CylinderGeometry(0.008, 0.011, 0.15, 4);
  stem.translate(0, 0.075, 0);
  paintSolid(stem, new THREE.Color(colors.stem));

  const head = new THREE.CylinderGeometry(0.052, 0.052, 0.012, 6);
  head.translate(0, 0.15, 0);
  paintSolid(head, new THREE.Color('#ffffff'));

  const merged = mergeGeometries([stem, head], false);
  merged.computeVertexNormals();
  return merged;
})();

interface VegetationProps {
  counts: VegetationTierCounts;
}

/**
 * Vida vegetal de apoyo a ras de suelo, reutilizando el mismo patrón de
 * tiles reciclables que ya usan Road/Sunflowers (un `InstancedMesh` por
 * tipo, un generador determinístico por-tile sembrado por índice, y el
 * mismo `recycleTileIndices`/`tileRenderZ` compartidos): arbustos, piedras
 * bajas y florecitas silvestres. Todo disperso y barato — el objetivo es
 * romper la monotonía del césped sin llenar la escena de objetos.
 */
export function Vegetation({ counts }: VegetationProps) {
  const bushRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.InstancedMesh>(null);
  const grassRef = useRef<THREE.InstancedMesh>(null);

  const scrollState = useScrollState();
  const indices = useRef<number[]>(createInitialTileIndices()).current;

  const bushLocals = useRef<BushLocal[][]>(indices.map((index) => generateBushes(index, counts.bushes))).current;
  const rockLocals = useRef<RockLocal[][]>(indices.map((index) => generateRocks(index, counts.rocks))).current;
  const flowerLocals = useRef<WildflowerLocal[][]>(
    indices.map((index) => generateWildflowers(index, counts.wildflowers)),
  ).current;
  const grassLocals = useRef<GrassLocal[][]>(indices.map((index) => generateGrass(index, counts.grass))).current;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const flowerColor = useMemo(() => new THREE.Color(), []);
  const flowerWhite = useMemo(() => new THREE.Color('#fbf6e8'), []);
  const flowerYellow = useMemo(() => new THREE.Color('#f4d868'), []);

  const bushCount = counts.bushes * TOTAL_TILES;
  const rockCount = counts.rocks * TOTAL_TILES;
  const flowerCount = counts.wildflowers * TOTAL_TILES;
  const grassCount = counts.grass * TOTAL_TILES;

  useFrame(() => {
    const distance = scrollState.current.smoothDistance;
    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    const recycled = recycleTileIndices(indices, targetMinIndex);

    const bushMesh = bushRef.current;
    const rockMesh = rockRef.current;
    const flowerMesh = flowerRef.current;
    const grassMesh = grassRef.current;

    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      if (recycled[slot]) {
        bushLocals[slot] = generateBushes(indices[slot], counts.bushes);
        rockLocals[slot] = generateRocks(indices[slot], counts.rocks);
        flowerLocals[slot] = generateWildflowers(indices[slot], counts.wildflowers);
        grassLocals[slot] = generateGrass(indices[slot], counts.grass);
      }
      const tileWorldZ = tileRenderZ(indices[slot], distance);

      if (bushMesh) {
        const locals = bushLocals[slot];
        for (let i = 0; i < locals.length; i++) {
          const b = locals[i];
          dummy.position.set(b.x, b.scale * 0.65, tileWorldZ + b.z);
          dummy.rotation.set(0, b.rotationY, 0);
          dummy.scale.set(b.scale, b.scale * 0.8, b.scale);
          dummy.updateMatrix();
          bushMesh.setMatrixAt(slot * counts.bushes + i, dummy.matrix);
        }
      }

      if (rockMesh) {
        const locals = rockLocals[slot];
        for (let i = 0; i < locals.length; i++) {
          const r = locals[i];
          dummy.position.set(r.x, r.scaleY * 0.5, tileWorldZ + r.z);
          dummy.rotation.set(r.rotationX, r.rotationY, 0);
          dummy.scale.set(r.scaleX, r.scaleY, r.scaleZ);
          dummy.updateMatrix();
          rockMesh.setMatrixAt(slot * counts.rocks + i, dummy.matrix);
        }
      }

      if (flowerMesh) {
        const locals = flowerLocals[slot];
        for (let i = 0; i < locals.length; i++) {
          const f = locals[i];
          dummy.position.set(f.x, 0, tileWorldZ + f.z);
          dummy.rotation.set(0, f.rotationY, 0);
          dummy.scale.setScalar(f.scale);
          dummy.updateMatrix();
          const instanceIndex = slot * counts.wildflowers + i;
          flowerMesh.setMatrixAt(instanceIndex, dummy.matrix);
          flowerColor.copy(flowerWhite).lerp(flowerYellow, f.tint);
          flowerMesh.setColorAt(instanceIndex, flowerColor);
        }
      }

      if (grassMesh) {
        const locals = grassLocals[slot];
        for (let i = 0; i < locals.length; i++) {
          const g = locals[i];
          dummy.position.set(g.x, 0, tileWorldZ + g.z);
          dummy.rotation.set(0, g.rotationY, 0);
          dummy.scale.setScalar(g.scale);
          dummy.updateMatrix();
          grassMesh.setMatrixAt(slot * counts.grass + i, dummy.matrix);
        }
      }
    }

    if (grassMesh) grassMesh.instanceMatrix.needsUpdate = true;
    if (bushMesh) bushMesh.instanceMatrix.needsUpdate = true;
    if (rockMesh) rockMesh.instanceMatrix.needsUpdate = true;
    if (flowerMesh) {
      flowerMesh.instanceMatrix.needsUpdate = true;
      if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={grassRef}
        args={[grassGeometry, undefined, grassCount]}
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial vertexColors roughness={1} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={bushRef} args={[bushGeometry, undefined, bushCount]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial color={colors.stemDark} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={rockRef} args={[rockGeometry, undefined, rockCount]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#8c8574" roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={flowerRef}
        args={[wildflowerGeometry, undefined, flowerCount]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial vertexColors roughness={0.85} />
      </instancedMesh>
    </>
  );
}
