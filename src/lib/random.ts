/** Generador pseudoaleatorio determinístico (mulberry32) para disposiciones
 * consistentes entre renders (girasoles, nubes, etc.). */
export function createSeededRandom(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBetween(random: () => number, min: number, max: number) {
  return min + random() * (max - min);
}

export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Interpolación exponencial independiente del framerate (suavizado tipo "damp"). */
export function damp(current: number, target: number, lambda: number, delta: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}
