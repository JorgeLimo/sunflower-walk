import { createSeededRandom, randomBetween } from './random';
import { ROAD_WIDTH, TILE_LENGTH } from './constants';
import { colors } from './colors';
import { GREETER_PHRASES, type GreeterPose } from './greeterContent';
import { GREETER_FACE_COUNT } from './greeterFaceTexture';
import type { ExclusionZone } from './fieldDistribution';

export interface GreeterLocal {
  x: number;
  /** Z LOCAL relativo al centro del tile que la renderiza (no world Z). */
  z: number;
  rotationY: number;
  /** Giro EXTRA del cartel (además del `rotationY` del cuerpo, se suma
   * encima como rotación de su propio grupo) — ver el comentario sobre
   * `SIGN_YAW_BIAS` más abajo. */
  signYaw: number;
  pose: GreeterPose;
  phraseIndex: number;
  outfitIndex: number;
  faceIndex: number;
  hairIndex: number;
  /** Variación de altura/complexión (±15%) para que la fila de personitas
   * nunca se sienta un molde repetido. */
  heightScale: number;
  /** Desfasaje para que el balanceo/salto de cada personita no esté
   * sincronizado con las demás visibles al mismo tiempo. */
  phase: number;
}

export interface TileGreeters {
  left: GreeterLocal | null;
  right: GreeterLocal | null;
  /** Segunda personita por lado, más adentro del campo (ver `FAR_BAND`):
   * espectadores ocasionales entre las flores, no solo pegados al camino. */
  farLeft: GreeterLocal | null;
  farRight: GreeterLocal | null;
  /** Tercera posición, todavía más adentro del campo (ver `WIDE_BAND`). */
  wideLeft: GreeterLocal | null;
  wideRight: GreeterLocal | null;
}

// Antes las 5 poses se elegían con la misma probabilidad, lo que dejaba
// "front" (la única con los brazos abajo) apareciendo tan seguido como
// cualquier otra — a pedido explícito de que el camino se sienta mucho más
// alegre y celebratorio, ahora las poses con brazos arriba/saltos/festejo
// pesan bastante más que la única pose tranquila, que sigue existiendo
// (para variedad y "balanceo natural del torso") pero como la menos común.
const POSE_WEIGHTS: [GreeterPose, number][] = [
  ['front', 0.12],
  ['overhead', 0.22],
  ['armsUp', 0.26],
  ['jump', 0.2],
  ['celebrate', 0.2],
];

function pickPose(random: () => number): GreeterPose {
  let r = random();
  for (const [pose, weight] of POSE_WEIGHTS) {
    if (r < weight) return pose;
    r -= weight;
  }
  return POSE_WEIGHTS[POSE_WEIGHTS.length - 1][0];
}

// Antes la aparición se decidía UNA vez por bloque de varios tiles y para
// ambos lados a la vez, lo que las dejaba demasiado espaciadas y siempre
// solitarias. Ahora cada lado del camino tira su propia moneda, de forma
// independiente, en CADA tile (32 unidades) — así es normal que a lo largo
// del tramo visible (unos 6-7 tiles por delante) se vean varias personitas
// a la vez, a profundidades distintas y sin que un lado dependa del otro,
// sin llegar a sentirse una multitud (siguen siendo, como mucho, una por
// lado cada 32 unidades).
//
// Subido de 0.42 a 0.62 y ahora a 0.75 (ronda tras ronda, a pedido
// explícito de "reduce la distancia... tengo que caminar demasiados
// pasos"): con las dos monedas independientes por tile, esto ya alcanza a
// veces para que dos tiles seguidos del mismo lado caigan juntos (se lee
// como un pequeño grupo cercano) sin necesidad de un generador de "grupos"
// aparte — la variedad de separación pedida sale sola de que cada lado y
// cada tile se deciden por separado.
const SPAWN_CHANCE = 0.78;

// Radio (unidades de mundo) que las flores/vegetación deben dejar libre
// alrededor de cada personita — ver `greeterExclusionZonesForTile` más
// abajo. Pensado para que ni el cuerpo ni el cartel (que se extiende hacia
// un costado según la pose) queden atravesados por un girasol/tulipán/lirio
// creciendo justo ahí, sin dejar un círculo de césped tan grande que se
// note como "hueco artificial". Subido de 1.15 a 1.5: con 1.15 la BASE de
// un girasol vecino ya quedaba afuera del círculo, pero su hoja (que se
// extiende bastante más allá del tallo) todavía alcanzaba a rozar la
// esquina del cartel — este margen extra le da lugar a la hoja sin que el
// círculo se note como un claro artificial en el pasto.
const GREETER_EXCLUSION_RADIUS = 1.9;

// El cartel mira "hacia el camino" (perpendicular, ±90°) por defecto, pero
// la protagonista lo ve casi siempre desde ADELANTE (el mundo se desliza
// hacia ella; solo en el instante exacto de pasar al lado queda justo
// perpendicular a su vista) — así que un cartel perfectamente perpendicular
// se lee de perfil durante casi todo el acercamiento y recién de frente un
// instante. Este sesgo gira el cartel (no el cuerpo) un poco hacia esa
// dirección de acercamiento, como si la persona lo hubiera ladeado a
// propósito para mostrarlo a quien se aproxima — de perfil nunca, de frente
// exacto tampoco, legible durante todo el tramo en el que se lo ve.
const SIGN_YAW_BIAS = 0.8;

// Segunda tirada, independiente de la de arriba, para una personita "de
// fondo" más adentro del campo — a pedido explícito de que no todas queden
// pegadas al borde del camino, algunas como espectadoras entre las flores.
// Chance más baja que `SPAWN_CHANCE`: es un extra ocasional, no una segunda
// fila pareja (eso sí se sentiría como multitud).
const FAR_SPAWN_CHANCE = 0.4;
const FAR_BAND_MIN = ROAD_WIDTH / 2 + 1.8;
const FAR_BAND_MAX = ROAD_WIDTH / 2 + 3.4;

interface SideBand {
  spawnChance: number;
  xMin: number;
  xMax: number;
  /** Semilla propia por banda: sin esto, la tirada de la personita lejana
   * consumiría los mismos números aleatorios que la cercana y ambas
   * quedarían correlacionadas (mismas poses/frases/colores en el mismo
   * tile) en vez de decidirse de forma realmente independiente. */
  seedOffset: number;
}

const NEAR_BAND: SideBand = { spawnChance: SPAWN_CHANCE, xMin: ROAD_WIDTH / 2 + 0.45, xMax: ROAD_WIDTH / 2 + 1.15, seedOffset: 0 };
const FAR_BAND: SideBand = { spawnChance: FAR_SPAWN_CHANCE, xMin: FAR_BAND_MIN, xMax: FAR_BAND_MAX, seedOffset: 104729 };
// Tercera franja, bien adentro del campo: algunas personitas/carteles
// lejos del borde (espectadoras entre las flores) para llenar los laterales
// que se sentían vacíos, sin formar una fila junto al camino.
const WIDE_BAND: SideBand = {
  spawnChance: 0.24,
  xMin: ROAD_WIDTH / 2 + 3.7,
  xMax: ROAD_WIDTH / 2 + 7,
  seedOffset: 209459,
};
/** En orden de prioridad: si dos personitas quedan demasiado cerca, se
 * queda la de la franja más cercana al camino. */
const BANDS: SideBand[] = [NEAR_BAND, FAR_BAND, WIDE_BAND];
/** Separación mínima entre dos personitas del mismo lado (unidades): el
 * cartel de una nunca tapa ni se cruza con la de al lado. */
const MIN_GREETER_SPACING = 3.6;

function generateSideGreeter(index: number, side: -1 | 1, band: SideBand): GreeterLocal | null {
  // Semillas separadas por lado (y siempre distintas entre sí) para que
  // izquierda y derecha nunca queden sincronizadas ni se reflejen.
  const seedBase = side < 0 ? 3181 : 6427;
  const random = createSeededRandom(index * 7919 + seedBase + band.seedOffset);

  if (random() > band.spawnChance) return null;

  const z = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
  // Lo más pegado al camino que se pueda sin invadirlo: más allá de acá el
  // campo de girasoles/tulipanes/lirios es denso desde el mismísimo borde
  // (no hay ningún tramo despejado), así que quedarse cerca es lo único que
  // deja a la personita entre la primera fila de plantas en vez de detrás
  // de varias capas superpuestas. La banda "lejana" (`FAR_BAND`) repite el
  // mismo criterio pero más adentro del campo, para las espectadoras.
  const x = side * randomBetween(random, band.xMin, band.xMax);
  // Mirando hacia el camino (hacia x=0): +Z local pasa a apuntar a +X del
  // mundo con rotationY=+π/2 (lado izquierdo) o a -X con -π/2 (lado
  // derecho), más un jitter pequeño para que no queden todas en escuadra.
  const faceRoad = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const rotationY = faceRoad + randomBetween(random, -0.3, 0.3);
  // Reduce el giro perpendicular una fracción constante hacia la dirección
  // desde donde se acerca la protagonista (ver comentario de
  // `SIGN_YAW_BIAS`) — mismo signo que `side` para que ambos lados giren
  // hacia adentro del camino, no hacia afuera.
  const signYaw = side * SIGN_YAW_BIAS;
  const pose = pickPose(random);
  const phraseIndex = Math.floor(random() * GREETER_PHRASES.length);
  const outfitIndex = Math.floor(random() * colors.greeterOutfits.length);
  const faceIndex = Math.floor(random() * GREETER_FACE_COUNT);
  const hairIndex = Math.floor(random() * colors.greeterHair.length);
  const heightScale = randomBetween(random, 0.87, 1.13);
  const phase = random() * Math.PI * 2;

  return { x, z, rotationY, signYaw, pose, phraseIndex, outfitIndex, faceIndex, hairIndex, heightScale, phase };
}

interface RawCandidate {
  band: number;
  side: -1 | 1;
  greeter: GreeterLocal;
}

const rawCache = new Map<number, RawCandidate[]>();
const tileCache = new Map<number, TileGreeters>();
const CACHE_LIMIT = 256;

/** Todas las candidatas de un tile, sin filtrar por cercanía. */
function rawCandidates(index: number): RawCandidate[] {
  const cached = rawCache.get(index);
  if (cached) return cached;
  const out: RawCandidate[] = [];
  BANDS.forEach((band, bandIndex) => {
    for (const side of [-1, 1] as const) {
      const greeter = generateSideGreeter(index, side, band);
      if (greeter) out.push({ band: bandIndex, side, greeter });
    }
  });
  if (rawCache.size > CACHE_LIMIT) rawCache.clear();
  rawCache.set(index, out);
  return out;
}

/** ¿Hay otra candidata con prioridad (franja más cercana al camino, o el
 * tile de menor índice si son de la misma franja) demasiado cerca? Revisa
 * también los tiles vecinos, para que dos personitas a ambos lados de una
 * costura no se pisen. Es simétrico: nunca se descartan las dos a la vez. */
function isCrowded(index: number, c: RawCandidate): boolean {
  const minSq = MIN_GREETER_SPACING * MIN_GREETER_SPACING;
  for (const di of [-1, 0, 1]) {
    const otherIndex = index + di;
    const zShift = -di * TILE_LENGTH;
    for (const o of rawCandidates(otherIndex)) {
      if (o.side !== c.side) continue;
      if (di === 0 && o.band === c.band) continue;
      const hasPriority = o.band < c.band || (o.band === c.band && otherIndex < index);
      if (!hasPriority) continue;
      const dx = o.greeter.x - c.greeter.x;
      const dz = o.greeter.z + zShift - c.greeter.z;
      if (dx * dx + dz * dz < minSq) return true;
    }
  }
  return false;
}

/**
 * Genera (determinísticamente, a partir de `index`) las personitas que le
 * corresponden al tile `index`: hasta una cercana, una lejana y una "de
 * fondo" por lado, cada una decidida de forma independiente y descartada si
 * queda demasiado cerca de otra. Mismo patrón que el resto de los
 * generadores por-tile (girasoles, lirios, tulipanes): la llamada es
 * puramente función de `index`, así que recalcularla siempre da el mismo
 * resultado (por eso se puede cachear).
 */
export function generateTileGreeters(index: number): TileGreeters {
  const cached = tileCache.get(index);
  if (cached) return cached;
  const result: TileGreeters = {
    left: null,
    right: null,
    farLeft: null,
    farRight: null,
    wideLeft: null,
    wideRight: null,
  };
  const keys = [
    ['left', 'right'],
    ['farLeft', 'farRight'],
    ['wideLeft', 'wideRight'],
  ] as const;
  for (const c of rawCandidates(index)) {
    if (isCrowded(index, c)) continue;
    result[keys[c.band][c.side < 0 ? 0 : 1]] = c.greeter;
  }
  if (tileCache.size > CACHE_LIMIT) tileCache.clear();
  tileCache.set(index, result);
  return result;
}

/**
 * Zonas circulares que las flores/vegetación de ESTE tile deben evitar
 * (ver `ExclusionZone`/`scatterInBand` en fieldDistribution.ts) — una por
 * cada personita que le toque a este índice, si le toca alguna. Cada
 * generador de especie (girasoles, tulipanes, lirios) llama a esto con el
 * mismo `index` que ya usa para su propia siembra, así que el cálculo de
 * `generateTileGreeters` se repite (es barato, una función pura) pero
 * nunca se desincroniza de dónde realmente termina cada personita.
 */
export function greeterExclusionZonesForTile(index: number): ExclusionZone[] {
  const zones: ExclusionZone[] = [];
  // También hay que revisar los tiles VECINOS: una personita cerca del
  // borde de su propio tile (z próximo a ±TILE_LENGTH/2) puede quedar del
  // lado de una flor que en realidad pertenece al tile de al lado — sin
  // esto, esa flor nunca se enteraba de que había alguien ahí y seguía
  // atravesando el cartel exactamente como antes de este arreglo.
  for (const offset of [-1, 0, 1]) {
    const tile = generateTileGreeters(index + offset);
    // `tileRenderZ` ubica el tile `index` en `... - index*TILE_LENGTH`, así
    // que un punto local `z` en el tile vecino `index+offset` cae, en el
    // sistema de coordenadas LOCAL del tile `index`, en `z - offset*
    // TILE_LENGTH` (no `+`): el signo va invertido respecto del offset.
    const zShift = -offset * TILE_LENGTH;
    for (const g of [tile.left, tile.right, tile.farLeft, tile.farRight, tile.wideLeft, tile.wideRight]) {
      if (g) zones.push({ x: g.x, z: g.z + zShift, radius: GREETER_EXCLUSION_RADIUS });
    }
  }
  return zones;
}
