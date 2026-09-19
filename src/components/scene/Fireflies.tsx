import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { ROAD_WIDTH, TILE_LENGTH, TOTAL_TILES } from '../../lib/constants';
import { createInitialTileIndices, recycleTileIndices, tileRenderZ } from '../../lib/tileSystem';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

interface FireflyLocal {
  x: number;
  /** Z LOCAL relativo al centro del tile (igual convención que girasoles/
   * lirios/tulipanes/personitas): el avance por scroll lo aporta sumar
   * `tileRenderZ` cuadro a cuadro, no esto. */
  z: number;
  baseY: number;
  /** Tamaño propio (unidades de mundo): no todas brillan igual de grande. */
  size: number;
  /** Amplitud de deriva por eje: cada una recorre su propia zona, con más
   * recorrido en Z (acercarse/alejarse de la cámara) que de costado. */
  ampX: number;
  ampY: number;
  ampZ: number;
  /** Dos frecuencias por eje (una lenta y otra más rápida y chica) para que
   * la trayectoria sea irregular y no una elipse repetida. */
  speedX: number;
  speedY: number;
  speedZ: number;
  phaseX: number;
  phaseY: number;
  phaseZ: number;
  flickerPhase: number;
  flickerSpeed: number;
  /** 0..1: variación de tono entre dos amarillos cálidos. */
  warmth: number;
}

// Antes las luciérnagas salían en manchones pegados al camino, a la misma
// altura baja y con el mismo brillo redondo que los faroles (esferas
// emisivas a ras del suelo, junto al borde) — de noche era fácil
// confundirlas. Ahora cada una es INDEPENDIENTE (sin manchones), repartida
// en TODO el ancho visible del campo con la coordenada Z estratificada
// (sin grumos ni patrón), a alturas muy distintas, siempre bien separada de
// la franja donde están los faroles, más chica que un farol y con un
// amarillo algo más verdoso.
const MIN_PER_TILE = 14;
const MAX_PER_TILE = 24;
/** Distancia mínima al borde del camino: los faroles viven dentro de los
 * primeros ~0.75 desde el borde, esto deja un colchón bien claro. */
const ROAD_CLEARANCE = 2.4;
const FIELD_REACH = 18;

/** Genera (determinísticamente, a partir de `index`) las luciérnagas de UN
 * tile — mismo patrón determinístico por-tile que el resto del mundo. */
function generateTileFireflies(index: number): FireflyLocal[] {
  const random = createSeededRandom(index * 6203 + 911);
  const count = MIN_PER_TILE + Math.floor(random() * (MAX_PER_TILE - MIN_PER_TILE + 1));
  const out: FireflyLocal[] = [];
  for (let i = 0; i < count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    // Z estratificado: una por franja del tile, con jitter dentro de la
    // franja — cubre parejo el largo sin formar filas ni grupos.
    const z = -TILE_LENGTH / 2 + ((i + random()) / count) * TILE_LENGTH;
    // Más chances cerca (donde se ven más grandes) pero con cola larga hacia
    // el horizonte lateral.
    const reach = Math.pow(random(), 1.8) * FIELD_REACH;
    const x = side * (ROAD_WIDTH / 2 + ROAD_CLEARANCE + reach);
    out.push({
      x,
      z,
      baseY: 0.4 + Math.pow(random(), 1.2) * 1.25,
      size: randomBetween(random, 0.11, 0.24),
      ampX: randomBetween(random, 0.3, 1.2),
      ampY: randomBetween(random, 0.1, 0.32),
      ampZ: randomBetween(random, 0.5, 1.7),
      speedX: randomBetween(random, 0.12, 0.42),
      speedY: randomBetween(random, 0.2, 0.55),
      speedZ: randomBetween(random, 0.1, 0.36),
      phaseX: random() * Math.PI * 2,
      phaseY: random() * Math.PI * 2,
      phaseZ: random() * Math.PI * 2,
      flickerPhase: random() * Math.PI * 2,
      flickerSpeed: randomBetween(random, 0.4, 1.1),
      warmth: random(),
    });
  }
  return out;
}

/** Textura de punto suave: un degradado radial cálido, generado una sola vez. */
function createGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Núcleo diminuto y muy definido, con un halo apenas insinuado: se lee
  // como un insecto luminoso y no como un foco.
  gradient.addColorStop(0, 'rgba(255, 255, 240, 1)');
  gradient.addColorStop(0.1, 'rgba(255, 246, 200, 0.9)');
  gradient.addColorStop(0.28, 'rgba(255, 228, 140, 0.18)');
  gradient.addColorStop(0.55, 'rgba(255, 220, 130, 0.04)');
  gradient.addColorStop(1, 'rgba(255, 220, 130, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const glowTexture = createGlowTexture();
const OFFSCREEN_Y = -500;
const TOTAL_POINTS = TOTAL_TILES * MAX_PER_TILE;
/** Tope de tamaño en pantalla (px): una luciérnaga pasando muy cerca de la
 * cámara no debe crecer hasta parecer un farol. */
const MAX_POINT_PX = 9;
/** Piso de tamaño en pantalla: las lejanas se ven como un puntito, no desaparecen. */
const MIN_POINT_PX = 4;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uScale;
  uniform float uMaxPx;
  uniform float uMinPx;
  varying vec3 vColor;
  void main() {
    // Se desvanecen con la distancia: sin esto, la perspectiva amontona las
    // lejanas en una franja de puntos pegada al horizonte.
    float fade = 1.0 - smoothstep(55.0, 125.0, -(modelViewMatrix * vec4(position, 1.0)).z);
    vColor = aColor * fade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / -mv.z, uMinPx, uMaxPx);
    gl_Position = projectionMatrix * mv;
  }
`;
const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * tex.rgb, tex.a * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Luciérnagas: pequeños insectos luminosos flotando por TODO el campo, solo
 * de noche. A diferencia de las estrellas (lejos, en el cielo, fijas) y de
 * los faroles del camino (esferas fijas pegadas al borde, con su charco de
 * luz en el suelo), cada una vaga sola, con su propio ritmo, altura,
 * tamaño y parpadeo — sin manchones ni patrón. Nunca iluminan de verdad la
 * escena (son sprites aditivos, no una `PointLight`).
 *
 * Mismo patrón determinístico por-tile que el resto del campo, pero SIN el
 * truco de `<group>` por slot: cada una se mueve todos los cuadros, así que
 * se computa la posición de mundo completa cuadro a cuadro.
 */
export function Fireflies() {
  const scrollState = useScrollState();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const skyState = useRef(createSkyState()).current;
  const indices = useRef<number[]>(createInitialTileIndices()).current;
  const tileLocals = useRef<FireflyLocal[][]>(indices.map((index) => generateTileFireflies(index))).current;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TOTAL_POINTS * 3), 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(new Float32Array(TOTAL_POINTS * 3), 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(new Float32Array(TOTAL_POINTS), 1));
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uMap: { value: glowTexture },
      uOpacity: { value: 0 },
      uScale: { value: 400 },
      uMaxPx: { value: MAX_POINT_PX },
      uMinPx: { value: MIN_POINT_PX },
    }),
    [],
  );

  // Amarillos algo verdosos (como una luciérnaga real), a propósito distintos
  // del naranja cálido de los faroles.
  const warmA = useMemo(() => new THREE.Color('#e6f27a'), []);
  const warmB = useMemo(() => new THREE.Color('#ffd86a'), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const distance = scrollState.current.smoothDistance;
    const targetMinIndex = Math.floor(distance / TILE_LENGTH) - 2;
    const recycled = recycleTileIndices(indices, targetMinIndex);

    getSkyState(getCycleProgress(distance), skyState);
    // Aparecen recién entrada la noche y se apagan antes del amanecer
    // pleno — el mismo tramo de transición que ya usan las estrellas
    // fugaces, para que enciendan/apaguen junto con el resto del cielo.
    const nightGate = THREE.MathUtils.smoothstep(skyState.nightFactor, 0.3, 0.55);
    // Se escribe en los uniforms del material montado (R3F no comparte el
    // objeto `uniforms` que se le pasa por props, lo copia).
    const matUniforms = materialRef.current?.uniforms;
    if (matUniforms) {
      matUniforms.uOpacity.value = nightGate * 0.9;
      // Mismo factor que usa three para `PointsMaterial.sizeAttenuation`.
      matUniforms.uScale.value = state.gl.domElement.height / 2;
      matUniforms.uMaxPx.value = MAX_POINT_PX * state.gl.getPixelRatio();
      matUniforms.uMinPx.value = MIN_POINT_PX * state.gl.getPixelRatio();
    }

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colorAttr = geometry.attributes.aColor as THREE.BufferAttribute;
    const sizeAttr = geometry.attributes.aSize as THREE.BufferAttribute;

    // De día (nightGate=0) no vale la pena tocar los buffers: quedan donde
    // estaban y la opacidad 0 las oculta igual.
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

        // Dos senos por eje con frecuencias no múltiplos entre sí: recorrido
        // irregular, distinto para cada una, sin repetirse.
        const driftX = Math.sin(t * f.speedX + f.phaseX) * f.ampX + Math.sin(t * f.speedX * 2.3 + f.phaseZ) * f.ampX * 0.25;
        const driftY = Math.sin(t * f.speedY + f.phaseY) * f.ampY;
        const driftZ = Math.cos(t * f.speedZ + f.phaseZ) * f.ampZ + Math.sin(t * f.speedZ * 1.9 + f.phaseX) * f.ampZ * 0.3;

        posAttr.setXYZ(idx, f.x + driftX, f.baseY + driftY, tileWorldZ + f.z + driftZ);
        sizeAttr.setX(idx, f.size);

        // Brillo que sube y se apaga suavemente (elevado a una potencia: pasa
        // más tiempo tenue y destella en el pico), pudiendo casi apagarse.
        const raw = Math.sin(t * f.flickerSpeed + f.flickerPhase) * 0.5 + 0.5;
        const flicker = Math.pow(raw, 1.8) * 0.9 + 0.1;
        // Unas se ven más que otras (profundidad), derivado de la fase para no
        // consumir números aleatorios nuevos y mantener las posiciones.
        const visibility = 0.5 + 0.6 * ((f.flickerPhase * 7.31) % 1);

        scratchColor.copy(warmA).lerp(warmB, f.warmth).multiplyScalar(flicker * visibility * 7);
        colorAttr.setXYZ(idx, scratchColor.r, scratchColor.g, scratchColor.b);
      }
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
