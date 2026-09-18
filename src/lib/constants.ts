/** Constantes compartidas del mundo 3D infinito. */

/** Ancho del camino de tierra. */
export const ROAD_WIDTH = 3.4;

/** Longitud de cada segmento reciclable del mundo (camino + girasoles). */
export const TILE_LENGTH = 32;

/** Segmentos que se mantienen detrás y delante del personaje. */
export const TILES_BEHIND = 2;
export const TILES_AHEAD = 6;
export const TOTAL_TILES = TILES_BEHIND + 1 + TILES_AHEAD;

/** Punto de partida (Z) de la persona y el Pug. */
export const WALK_START_Z = 4;

/** Offset lateral del Pug respecto a la persona (a su izquierda). */
export const PUG_SIDE_OFFSET = -0.85;

/** Offset lateral del gato: el mismo que el del Pug pero al otro costado,
 * para que los tres avancen como un grupo equilibrado (gato — persona —
 * Pug) en vez de quedar el gato descolgado y más abierto que el perro. */
export const CAT_SIDE_OFFSET = -PUG_SIDE_OFFSET;

/** Cuánta distancia de mundo (unidades) avanza por pixel de scroll. Bajo a
 * propósito: el paseo debe sentirse lento y cinematográfico, nunca veloz. */
export const SCROLL_TO_WORLD = 0.012;

/** El tope real de velocidad del mundo (unidades de mundo / segundo): por
 * más fuerte que se scrollee, `smoothDistance` — de donde sale TODO el
 * movimiento visible (camino, tiles, ciclo día/noche, faroles, etc., ver
 * `ScrollPhysics.tsx`) — nunca avanza más rápido que esto. También es la
 * velocidad a la que la caminata de la protagonista/Pug/gato alcanza su
 * intensidad máxima, por diseño: son la misma referencia de velocidad, así
 * que un scroll sostenido siempre las mantiene sincronizadas entre sí.
 * ×3 en una ronda anterior y ×2 más en esta (×6 sobre el original) para
 * que el recorrido avance más rápido en conjunto — la cadencia de piernas
 * (`WALK_FREQ` en Person.tsx y equivalentes en Pug.tsx/Cat.tsx) se
 * mantiene en su ritmo natural, sin tocar, así que el paso se ve más largo
 * (más distancia real por zancada) en vez de una caminata acelerada o una
 * carrera. `MAX_LEAD` en ScrollPhysics.tsx se calcula a partir de esta
 * constante, así que escala solo. */
export const VELOCITY_FOR_FULL_WALK = 1.0 * 3 * 2;

/** Longitud (en unidades de mundo) de un ciclo día→noche→día completo.
 * Se redujo junto con SCROLL_TO_WORLD para mantener aproximadamente el
 * mismo esfuerzo de scroll por ciclo que antes, pero recorriendo menos
 * distancia de mundo: el tiempo pasa más rápido que la caminata en sí. */
export const CYCLE_LENGTH = 75;

/** Cada cuánta distancia se repite la fila de montañas lejanas. */
export const MOUNTAIN_LOOP_LENGTH = 300;
