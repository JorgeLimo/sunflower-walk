import { useScrollState } from './scrollContext';
import { useFrame } from '@react-three/fiber';
import { clamp } from '../../lib/random';
import { VELOCITY_FOR_FULL_WALK } from '../../lib/constants';

// Con cuánta fuerza `smoothDistance` persigue a `rawDistance` cuando la
// brecha es chica (scroll a ritmo normal) — el mismo valor que ya tenía
// este suavizado antes de este ajuste, así que un scroll lento o varios
// scrolls pequeños se sienten exactamente igual que siempre: la brecha
// nunca llega a pedir más velocidad que el tope de abajo, así que el
// `clamp` nunca entra en juego para ellos.
const APPROACH_LAMBDA = 5;

// Cuánto puede adelantarse `rawDistance` a `smoothDistance` antes de
// recortarse, expresado en SEGUNDOS de avance a ritmo completo (no en
// unidades de mundo fijas) para que escale junto con
// `VELOCITY_FOR_FULL_WALK` — si ese tope de velocidad vuelve a cambiar,
// esto sigue representando "como mucho ~0.6s de colchón" en vez de
// quedarse con un valor absoluto pensado para una velocidad distinta (a
// una velocidad más alta, el mismo colchón en unidades de mundo se
// consumiría antes, pero también interferiría antes con un scroll
// sostenido normal — ver el equilibrio natural más abajo). Sin este tope,
// un solo gesto de scroll muy fuerte podía acumular una brecha enorme
// (decenas de unidades) que el mundo tenía que "pagar" caminando solo, a
// máxima velocidad, durante muchos segundos después de soltar el scroll —
// justo lo opuesto de "detenerse pronto sin frenar de golpe".
const MAX_LEAD_SECONDS = 0.6;
const MAX_LEAD = VELOCITY_FOR_FULL_WALK * MAX_LEAD_SECONDS;

/**
 * Corre dentro del Canvas y convierte `rawDistance` (crudo, escrito
 * directamente por el scroll del DOM, sin límite de velocidad) en
 * `smoothDistance` y `velocity` — la cadena rawScroll → smoothScroll →
 * velocity que consumen la cámara, el camino, el ciclo día/noche, los
 * personajes y las personitas.
 *
 * El punto central: `smoothDistance` (de donde sale TODO el movimiento
 * visible del mundo — tiles, faroles, ciclo día/noche, girasoles, etc.)
 * antes perseguía a `rawDistance` con una velocidad PROPORCIONAL a la
 * distancia entre ambas, sin ningún tope. Eso significa que un scroll muy
 * fuerte (que agranda esa brecha de golpe) podía hacer que el mundo
 * avanzara arbitrariamente rápido, mientras que la caminata de la
 * protagonista siempre está limitada a su ritmo máximo
 * (`VELOCITY_FOR_FULL_WALK`, ver Person.tsx/Pug.tsx/Cat.tsx) — de ahí la
 * sensación de que "el mundo corre pero ella camina tranquila".
 *
 * La corrección tiene dos partes:
 *
 * 1. La velocidad a la que avanza `smoothDistance` nunca supera
 *    `VELOCITY_FOR_FULL_WALK`, la MISMA velocidad a la que la caminata ya
 *    alcanza su ritmo completo. Así la protagonista es, por construcción,
 *    la referencia real de la velocidad del viaje.
 * 2. `rawDistance` nunca se deja acumular muy por delante de
 *    `smoothDistance` (ver `MAX_LEAD`) — sin esto, el tope de velocidad
 *    por sí solo igual dejaría un "colchón" de avance pendiente enorme
 *    tras un scroll extremo, que el mundo seguiría consumiendo solo
 *    durante mucho tiempo después de soltar el scroll.
 *
 * Deliberadamente se mantiene como un sistema de PRIMER orden (la
 * velocidad es siempre una función directa, recortada, de la brecha
 * actual — nunca se suaviza la velocidad en sí con una inercia propia):
 * eso es lo que garantiza que `smoothDistance` nunca se pase de largo ni
 * oscile al frenar, sin importar cuán abrupto sea el cambio de intensidad
 * del scroll. Un scroll lento sigue sintiéndose igual que antes; uno
 * fuerte deja de disparar el mundo y en cambio desacelera solo, en menos
 * de un segundo, apenas se suelta.
 */
export function ScrollPhysics() {
  const scrollState = useScrollState();

  useFrame((_, delta) => {
    const s = scrollState.current;
    const dt = Math.max(delta, 0.0001);

    // Recorta el "colchón" ANTES de calcularlo (ver comentario de
    // MAX_LEAD): el excedente de un scroll extremo se descarta acá mismo,
    // nunca se acumula a la espera de reproducirse después.
    s.rawDistance = clamp(s.rawDistance, s.smoothDistance - MAX_LEAD, s.smoothDistance + MAX_LEAD);

    const gap = s.rawDistance - s.smoothDistance;
    const speed = clamp(gap * APPROACH_LAMBDA, -VELOCITY_FOR_FULL_WALK, VELOCITY_FOR_FULL_WALK);
    s.smoothDistance += speed * dt;
    // La velocidad que ven Person/Pug/Cat para su intensidad de caminata es
    // esta misma — nunca la del scroll crudo — así el paso de los tres
    // queda perfectamente sincronizado con cuánto se mueve el mundo de
    // verdad, sin importar qué tan fuerte haya sido el scroll que lo pidió.
    s.velocity = speed;
  });

  return null;
}
