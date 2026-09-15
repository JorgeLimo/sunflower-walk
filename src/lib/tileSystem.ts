import { TILES_BEHIND, TOTAL_TILES, TILE_LENGTH } from './constants';
import { CHARACTER_Z } from './walk';

/** Índices iniciales de cada slot: cubren desde -TILES_BEHIND hasta +TILES_AHEAD. */
export function createInitialTileIndices(): number[] {
  return Array.from({ length: TOTAL_TILES }, (_, slot) => slot - TILES_BEHIND);
}

/**
 * Recicla los índices que quedaron fuera del rango visible, saltándolos en
 * múltiplos de TOTAL_TILES hacia el lado que corresponda. Es un buffer
 * circular: siempre hay exactamente TOTAL_TILES índices consecutivos
 * cubriendo [targetMinIndex, targetMinIndex + TOTAL_TILES - 1].
 *
 * Debe ser bidireccional: al avanzar, los índices que quedaron atrás saltan
 * hacia adelante (rama de abajo); pero al RETROCEDER, `targetMinIndex` baja
 * y son los índices que quedaron demasiado adelantados los que hay que traer
 * hacia atrás (rama de arriba). Sin esta segunda rama, retroceder lo
 * suficiente deja los 9 tiles varados por delante del rango visible y no
 * queda ningún camino renderizado alrededor del personaje.
 *
 * Devuelve qué slots se reciclaron este frame (para regenerar su contenido).
 */
export function recycleTileIndices(indices: number[], targetMinIndex: number): boolean[] {
  const targetMaxIndex = targetMinIndex + TOTAL_TILES - 1;
  const recycled = new Array(indices.length).fill(false);
  for (let slot = 0; slot < indices.length; slot++) {
    while (indices[slot] < targetMinIndex) {
      indices[slot] += TOTAL_TILES;
      recycled[slot] = true;
    }
    while (indices[slot] > targetMaxIndex) {
      indices[slot] -= TOTAL_TILES;
      recycled[slot] = true;
    }
  }
  return recycled;
}

/**
 * Posición Z (en unidades de mundo) donde debe renderizarse un tile de
 * índice `index`, dado cuánta distancia se ha recorrido.
 *
 * Importante: aunque `distance` crece sin límite con el scroll, el
 * resultado siempre queda acotado a un rango pequeño alrededor de
 * CHARACTER_Z — porque `recycleTileIndices` garantiza que `index` se
 * mantiene siempre cerca de `distance / TILE_LENGTH`. Nunca se debe usar
 * `distance` directamente como coordenada; solo esta diferencia acotada.
 */
export function tileRenderZ(index: number, distance: number): number {
  return CHARACTER_Z - (index * TILE_LENGTH - distance);
}
