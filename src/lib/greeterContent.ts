/** Frases motivadoras que sostienen las personitas del camino, y las poses
 * disponibles para transmitirlas. Contenido fijo (no generado): son solo 15
 * frases y 5 poses, así que viven aquí como listas simples en vez de un
 * generador — el azar solo decide QUÉ índice le toca a cada personita (ver
 * `generateTileGreeters.ts`). */

export const GREETER_PHRASES: string[] = [
  'Lo estás haciendo bien',
  'Lo vas a lograr',
  'Sigue adelante',
  'Nunca te rindas',
  'Todos estan orgullosos de ti',
  'Has avanzado mucho',
  'Eres una gran persona',
  'Felicidades por todo tu esfuerzo',
  'Tú puedes hacerlo',
  'Cada paso cuenta',
  'No te rindas',
  'Vas por buen camino',
  'Todo estará bien',
  'Lo estás haciendo increíble',
  'Vas mejor de lo que crees',
  'Todo esfuerzo vale la pena',
  'Confía en el proceso',
  'Puedes con todo',
  'Tu esfuerzo inspira',
  'Continúa, estás cerca',
  'Sigue adelante',
  'Tienes una bonita sonrisa',
  'Lo estás consiguiendo',
  'Sigue brillando',
  'Cada día lo haces mejor',
  'Se acabaron los texto xd'
];

export type GreeterPose = 'front' | 'overhead' | 'armsUp' | 'jump' | 'celebrate';

export const GREETER_POSES: GreeterPose[] = ['front', 'overhead', 'armsUp', 'jump', 'celebrate'];
