/**
 * Brisa compartida por todo el campo: una envolvente que viaja por el
 * mundo (en Z, con un empujón menor en X) y en el tiempo, usada para
 * modular la amplitud del balanceo que cada especie (girasol, tulipán,
 * lirio, vegetación) ya calcula por su cuenta — nunca reemplaza ese
 * balanceo individual (que sigue dando la variedad de fase/velocidad por
 * planta), solo lo hace más fuerte quiere cuando la ráfaga "pasa" por esa
 * zona y lo deja en su nivel de reposo el resto del tiempo.
 *
 * Dos ondas viajeras de longitud/velocidad distintas (nunca la misma
 * combinación se repite en el mismo punto y momento) en vez de una sola,
 * para que la ráfaga no se sienta como un metrónomo: a veces una zona
 * entra en ráfaga mientras la vecina todavía está en calma, y el patrón
 * nunca se ve perfectamente periódico.
 */

const WAVE1_FREQ_Z = 0.045;
const WAVE1_SPEED = 0.55;
const WAVE2_FREQ_Z = 0.016;
const WAVE2_SPEED = 0.22;
const WAVE2_FREQ_X = 0.02;

/** Nivel de reposo (sin ráfaga) y cuánto más fuerte se balancea en el pico
 * de una ráfaga — nunca apaga el balanceo de base (el campo debe seguir
 * "vivo" incluso entre ráfagas) ni lo dispara a una tormenta. */
const CALM_LEVEL = 0.75;
const GUST_BOOST = 1.15;

/**
 * Devuelve un multiplicador de amplitud (≈0.75 en calma, hasta ≈1.9 en el
 * pico de una ráfaga) para la posición de mundo `(worldX, worldZ)` en el
 * instante `t`. Se multiplica directamente contra la amplitud de balanceo
 * que cada especie ya tiene — ver el `sway` de Sunflowers.tsx/Tulips.tsx/
 * Lilies.tsx y las rotaciones de Vegetation.tsx.
 */
export function windGustFactor(worldX: number, worldZ: number, t: number): number {
  const wave1 = Math.sin(worldZ * WAVE1_FREQ_Z - t * WAVE1_SPEED);
  const wave2 = Math.sin(worldZ * WAVE2_FREQ_Z + worldX * WAVE2_FREQ_X - t * WAVE2_SPEED + 2.1);
  const combined = wave1 * 0.6 + wave2 * 0.4;
  const normalized = combined * 0.5 + 0.5;
  // Potencia > 1: la mayor parte del tiempo cerca de 0 (calma), con picos
  // suaves en vez de una onda pura que pasaría la mitad del tiempo "a mitad
  // de ráfaga" — así se lee como algo ocasional, no constante.
  const gust = Math.pow(normalized, 2.4);
  return CALM_LEVEL + gust * GUST_BOOST;
}
