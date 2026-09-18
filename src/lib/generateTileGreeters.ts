import { createSeededRandom, randomBetween } from './random';
import { ROAD_WIDTH, TILE_LENGTH } from './constants';
import { colors } from './colors';
import { GREETER_PHRASES, GREETER_POSES, type GreeterPose } from './greeterContent';
import { GREETER_FACE_COUNT } from './greeterFaceTexture';

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
  /** Desfasaje para que el balanceo/salto de cada personita no esté
   * sincronizado con las demás visibles al mismo tiempo. */
  phase: number;
}

export interface TileGreeters {
  left: GreeterLocal | null;
  right: GreeterLocal | null;
}

// Antes la aparición se decidía UNA vez por bloque de varios tiles y para
// ambos lados a la vez, lo que las dejaba demasiado espaciadas y siempre
// solitarias. Ahora cada lado del camino tira su propia moneda, de forma
// independiente, en CADA tile (32 unidades) — así es normal que a lo largo
// del tramo visible (unos 6-7 tiles por delante) se vean varias personitas
// a la vez, a profundidades distintas y sin que un lado dependa del otro,
// sin llegar a sentirse una multitud (siguen siendo, como mucho, una por
// lado cada 32 unidades).
const SPAWN_CHANCE = 0.42;

// El cartel mira "hacia el camino" (perpendicular, ±90°) por defecto, pero
// la protagonista lo ve casi siempre desde ADELANTE (el mundo se desliza
// hacia ella; solo en el instante exacto de pasar al lado queda justo
// perpendicular a su vista) — así que un cartel perfectamente perpendicular
// se lee de perfil durante casi todo el acercamiento y recién de frente un
// instante. Este sesgo gira el cartel (no el cuerpo) un poco hacia esa
// dirección de acercamiento, como si la persona lo hubiera ladeado a
// propósito para mostrarlo a quien se aproxima — de perfil nunca, de frente
// exacto tampoco, legible durante todo el tramo en el que se lo ve.
const SIGN_YAW_BIAS = 0.62;

function generateSideGreeter(index: number, side: -1 | 1): GreeterLocal | null {
  // Semillas separadas por lado (y siempre distintas entre sí) para que
  // izquierda y derecha nunca queden sincronizadas ni se reflejen.
  const seedBase = side < 0 ? 3181 : 6427;
  const random = createSeededRandom(index * 7919 + seedBase);

  if (random() > SPAWN_CHANCE) return null;

  const z = randomBetween(random, -TILE_LENGTH / 2, TILE_LENGTH / 2);
  // Lo más pegado al camino que se pueda sin invadirlo: más allá de acá el
  // campo de girasoles/tulipanes/lirios es denso desde el mismísimo borde
  // (no hay ningún tramo despejado), así que quedarse cerca es lo único que
  // deja a la personita entre la primera fila de plantas en vez de detrás
  // de varias capas superpuestas.
  const x = side * randomBetween(random, ROAD_WIDTH / 2 + 0.45, ROAD_WIDTH / 2 + 1.15);
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
  const pose = GREETER_POSES[Math.floor(random() * GREETER_POSES.length)];
  const phraseIndex = Math.floor(random() * GREETER_PHRASES.length);
  const outfitIndex = Math.floor(random() * colors.greeterOutfits.length);
  const faceIndex = Math.floor(random() * GREETER_FACE_COUNT);
  const phase = random() * Math.PI * 2;

  return { x, z, rotationY, signYaw, pose, phraseIndex, outfitIndex, faceIndex, phase };
}

/**
 * Genera (determinísticamente, a partir de `index`) las personitas que le
 * corresponden al tile `index`: como mucho una por lado, cada una decidida
 * de forma independiente. Mismo patrón que el resto de los generadores
 * por-tile (girasoles, lirios, tulipanes): la llamada es puramente función
 * de `index`, así que recalcularla siempre da el mismo resultado.
 */
export function generateTileGreeters(index: number): TileGreeters {
  return {
    left: generateSideGreeter(index, -1),
    right: generateSideGreeter(index, 1),
  };
}
