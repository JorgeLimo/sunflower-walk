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
  'Siempre confía en ti',
  'Tú puedes hacerlo',
  'Cada paso cuenta',
  'No te rindas',
  'Vas por buen camino',
  'Todo estará bien',
  'Sigue creyendo en ti',
  'Lo estás haciendo increíble',
  'Vas mejor de lo que crees',
  'No estás sola',
  'Todo esfuerzo vale la pena',
  'Confía en el proceso',
  'Un día a la vez',
  'Paso a paso llegarás',
  'Tu esfuerzo dará frutos',
  'Lo mejor está por venir',
  'Nunca dejes de intentarlo',
  'Puedes con todo',
  'Eres más fuerte de lo que crees',
  'No olvides lo mucho que vales',
  'Tu esfuerzo inspira',
  'Cada día es una nueva oportunidad',
  'Continúa, estás cerca',
  'Sigue adelante',
  'Los pequeños pasos también cuentan',
  'Todo comienza con un paso',
  'No dejes de soñar',
  'Tu sonrisa importa',
  'Mereces cosas bonitas',
  'Hay mucho por delante',
  'Lo estás consiguiendo',
  'Tu esfuerzo no es en vano',
  'Nunca pierdas la esperanza',
  'Sigue brillando',
  'El camino vale la pena',
  'Respira, puedes hacerlo',
  'No olvides cuánto has crecido',
  'Cada día lo haces mejor',
  'Todo será más bonito pronto',
  'Ya has llegado muy lejos',
  'Se acabaron los texto xd',
  'Tu perseverancia te llevará lejos',
  'Nunca subestimes tus pequeños avances',
  'Hay luz incluso en los días difíciles'
];

export type GreeterPose = 'front' | 'overhead' | 'armsUp' | 'jump' | 'celebrate';

export const GREETER_POSES: GreeterPose[] = ['front', 'overhead', 'armsUp', 'jump', 'celebrate'];
