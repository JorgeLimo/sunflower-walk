import { WALK_START_Z } from './constants';

/**
 * La persona y el Pug permanecen SIEMPRE en esta posición Z fija — es el
 * mundo (camino, girasoles, montañas, cielo) el que se desplaza hacia
 * ellos a medida que la distancia recorrida crece. Esto es intencional:
 * si en cambio moviéramos al personaje a una Z que crece sin límite, esa
 * distancia (potencialmente enorme tras mucho scroll) perdería precisión
 * en el pipeline de punto flotante de 32 bits de la GPU, y objetos muy
 * lejos del origen podían desaparecer o temblar. Mantener al personaje
 * anclado cerca del origen evita el problema por completo.
 */
export const CHARACTER_Z = WALK_START_Z;
