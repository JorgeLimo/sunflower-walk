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

/** Cuánta distancia de mundo (unidades) avanza por pixel de scroll. Bajo a
 * propósito: el paseo debe sentirse lento y cinematográfico, nunca veloz. */
export const SCROLL_TO_WORLD = 0.012;

/** Velocidad de scroll (unidades de mundo / segundo) a la que la caminata
 * alcanza su intensidad máxima. Por debajo de esto, se camina "a medias".
 * Reducida en la misma proporción que SCROLL_TO_WORLD, así que hace falta
 * el mismo esfuerzo de scroll de siempre para ver la caminata completa. */
export const VELOCITY_FOR_FULL_WALK = 1.0;

/** Longitud (en unidades de mundo) de un ciclo día→noche→día completo.
 * Se redujo junto con SCROLL_TO_WORLD para mantener aproximadamente el
 * mismo esfuerzo de scroll por ciclo que antes, pero recorriendo menos
 * distancia de mundo: el tiempo pasa más rápido que la caminata en sí. */
export const CYCLE_LENGTH = 75;

/** Cada cuánta distancia se repite la fila de montañas lejanas. */
export const MOUNTAIN_LOOP_LENGTH = 300;
