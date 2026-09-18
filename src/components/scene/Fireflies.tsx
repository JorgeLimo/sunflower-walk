import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { ROAD_WIDTH, TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { colors } from '../../lib/colors';

interface FireflyLocal {
  x: number;
  /** Z LOCAL relativo al centro del tile (igual convención que girasoles/
   * lirios/tulipanes/personitas): el avance por scroll lo aporta sumar
   * `tileRenderZ` cuadro a cuadro, no esto. */
  z: number;
  baseY: number;
  phaseX: number;
  phaseY: number;
  phaseZ: number;
  driftSpeed: number;
  flickerPhase: number;
  flickerSpeed: number;
  /** 0..1: variación cálida entre dos tonos, nunca todas del mismo amarillo. */
  warmth: number;
}

// Subido una vez a pedido explícito ("muy pocas... casi no se perciben") y
// ahora otra vez, más leve ("ya son visibles, pero quiero un poco más,
// sobre todo en los costados"): manchones apenas más grandes/frecuentes,
// más una tercera pasada suelta enfocada en las franjas laterales más
// alejadas del camino — pero cada tile sigue siendo su propia tirada
// independiente, así que la distribución final sigue sin ser una alfombra
// pareja: unos tramos del camino quedan con varias luciérnagas visibles a
// la vez y otros más tranquilos, nunca una "lluvia de partículas" constante.
const CLUSTER_CHANCE = 0.85;
const SOLO_CHANCE = 0.68;
const MAX_PER_TILE = 14;

function pushFirefly(out: FireflyLocal[], random: () => number, x: number, z: number) {
  out.push({
    x,
    z,
    // Rango de altura más amplio que antes: algunas casi al ras del suelo,
    // otras flotando a la altura de un tulipán/lirio — "diferentes alturas"
    // pedido explícitamente.
    baseY: randomBetween(random, 0.12, 0.68),
    phaseX: random() * Math.PI * 2,
    phaseY: random() * Math.PI * 2,
    phaseZ: random() * Math.PI * 2,
    driftSpeed: randomBetween(random, 0.22, 0.48),
    flickerPhase: random() * Math.PI * 2,
    flickerSpeed: randomBetween(random, 0.55, 1.3),
    warmth: random(),
  });
}

/** Genera (determinísticamente, a partir de `index`) las luciérnagas de UN
 * tile: como mucho un manchón de 3-7 más hasta tres individuales sueltas a
 * distintas distancias del camino — mismo patrón determinístico por-tile
 * que el resto del mundo (girasoles, lirios, personitas). */
function generateTileFireflies(index: number): FireflyLocal[] {
  const random = createSeededRandom(index * 6203 + 911);
  const out: FireflyLocal[] = [];

  if (random() < CLUSTER_CHANCE) {
    const side = random() < 0.5 ? -1 : 1;
    const cx = side * randomBetween(random, ROAD_WIDTH / 2 + 0.6, ROAD_WIDTH / 2 + 8);
    const cz = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
    const count = 3 + Math.floor(random() * 5);
    for (let i = 0; i < count; i++) {
      pushFirefly(out, random, cx + randomBetween(random, -1.5, 1.5), cz + randomBetween(random, -1.5, 1.5));
    }
  }

  // Una segunda pasada de "sueltas" (no solo una): entre las flores, un poco
  // más lejos del camino que los manchones — para que también aparezcan
  // luciérnagas más adentro del campo, no solo pegadas al borde.
  if (random() < SOLO_CHANCE) {
    const side = random() < 0.5 ? -1 : 1;
    pushFirefly(
      out,
      random,
      side * randomBetween(random, ROAD_WIDTH / 2 + 0.6, ROAD_WIDTH / 2 + 11),
      randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
    );
  }
  if (random() < SOLO_CHANCE * 0.7) {
    const side = random() < 0.5 ? -1 : 1;
    pushFirefly(
      out,
      random,
      side * randomBetween(random, ROAD_WIDTH / 2 + 3, ROAD_WIDTH / 2 + 16),
      randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
    );
  }
  // Tercera pasada, la más alejada de las tres: apunta específicamente a la
  // franja lateral más profunda del campo (pedido explícito de reforzar
  // "las zonas laterales"), con una chance moderada para que siga siendo un
  // extra ocasional, no una cuarta capa pareja.
  if (random() < SOLO_CHANCE * 0.5) {
    const side = random() < 0.5 ? -1 : 1;
    pushFirefly(
      out,
      random,
      side * randomBetween(random, ROAD_WIDTH / 2 + 9, ROAD_WIDTH / 2 + 19),
      randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2),
    );
  }

  return out.slice(0, MAX_PER_TILE);
}

/** Textura de punto suave (mismo recurso que el halo del cartel de las
 * personitas): un degradado radial cálido, generado una sola vez. */
function createGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 232, 180, 0.7)');
  gradient.addColorStop(1, 'rgba(255, 200, 120, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const glowTexture = createGlowTexture();
const OFFSCREEN_Y = -500;
const TOTAL_POINTS = TOTAL_TILES * MAX_PER_TILE;

/**
 * Luciérnagas: pequeños puntos de luz cálida cerca del suelo, entre la
 * vegetación, activos solo de noche. A diferencia de las estrellas (lejos,
 * en el cielo, fijas) y los faroles del camino (fijos, atados al borde del
 * camino), estas flotan lentamente y con deriva propia, agrupadas en
 * manchones dispersos — nunca iluminan de verdad la escena (son un sprite
 * aditivo, no una `PointLight`), así que jamás compiten con la iluminación
 * real ni con el brillo de los carteles de las personitas.
 *
 * Mismo patrón determinístico por-tile que el resto del campo, pero SIN el
 * truco de `<group>` por slot: como cada luciérnaga ya necesita recalcular
 * su posición todos los cuadros (flotan constantemente, nunca están
 * quietas), no hay ningún camino "barato" que optimizar — se computa la
 * posición de mundo completa cuadro a cuadro para las `TOTAL_TILES *
 * MAX_PER_TILE` instancias, igual que ya hace `Vegetation.tsx` con el
 * pasto/las piedras.
 */
export function Fireflies() {
  const scrollState = useScrollState();
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const skyState = useRef(createSkyState()).current;
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<FireflyLocal[][]>(indices.map((index) => generateTileFireflies(index))).current;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TOTAL_POINTS * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(TOTAL_POINTS * 3), 3));
    return geo;
  }, []);

  const warmA = useMemo(() => new THREE.Color('#ffe08a'), []);
  const warmB = useMemo(() => new THREE.Color(colors.sunGlow), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const distance = scrollState.current.smoothDistance;
    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    const recycled = recycleTileIndices(indices, targetMinIndex);

    getSkyState(getCycleProgress(distance), skyState);
    // Aparecen recién entrada la noche y se apagan antes del amanecer
    // pleno — el mismo tramo de transición que ya usan las estrellas
    // fugaces, para que enciendan/apaguen junto con el resto del cielo
    // nocturno en vez de a destiempo.
    const nightGate = THREE.MathUtils.smoothstep(skyState.nightFactor, 0.3, 0.55);
    if (materialRef.current) materialRef.current.opacity = nightGate * 0.9;

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colorAttr = geometry.attributes.color as THREE.BufferAttribute;

    // De día (nightGate=0) no vale la pena tocar los buffers: quedan donde
    // estaban y el material en opacidad 0 las oculta igual.
    if (nightGate <= 0.001 && !recycled.some(Boolean)) {
      return;
    }

    for (let slot = 0; slot < TOTAL_TILES; slot++) {
      if (recycled[slot]) {
        tileLocals[slot] = generateTileFireflies(indices[slot]);
      }
      const tileWorldZ = tileRenderZ(indices[slot], distance);
      const locals = tileLocals[slot];

      for (let i = 0; i < MAX_PER_TILE; i++) {
        const idx = slot * MAX_PER_TILE + i;
        const f = locals[i];
        if (!f) {
          posAttr.setXYZ(idx, 0, OFFSCREEN_Y, 0);
          continue;
        }

        const driftX = Math.sin(t * f.driftSpeed + f.phaseX) * 0.35;
        const driftY = Math.sin(t * f.driftSpeed * 0.7 + f.phaseY) * 0.18;
        const driftZ = Math.cos(t * f.driftSpeed * 0.6 + f.phaseZ) * 0.35;

        posAttr.setXYZ(idx, f.x + driftX, f.baseY + driftY, tileWorldZ + f.z + driftZ);

        // Parpadeo suave (no un simple seno: elevado a una potencia para que
        // pase más tiempo tenue y solo destelle brevemente en el pico, como
        // una luciérnaga real en vez de una luz que respira parejo).
        const raw = Math.sin(t * f.flickerSpeed + f.flickerPhase) * 0.5 + 0.5;
        const flicker = Math.pow(raw, 2.2) * 0.75 + 0.25;

        scratchColor.copy(warmA).lerp(warmB, f.warmth).multiplyScalar(flicker);
        colorAttr.setXYZ(idx, scratchColor.r, scratchColor.g, scratchColor.b);
      }
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        ref={materialRef}
        map={glowTexture}
        size={0.22}
        vertexColors
        transparent
        opacity={0}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
