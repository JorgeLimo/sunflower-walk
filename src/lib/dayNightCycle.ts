import * as THREE from 'three';
import { CYCLE_LENGTH } from './constants';

export interface SkyState {
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  hemiIntensity: number;
  ambientIntensity: number;
  /** Luz "sol": cálida, domina de día, casi apagada de noche. */
  sunLightIntensity: number;
  sunLightColor: THREE.Color;
  /** Luz "luna": fría, apagada de día, releva al sol como luz de relleno de noche. */
  moonLightIntensity: number;
  moonLightColor: THREE.Color;
  exposure: number;
  starOpacity: number;
  moonOpacity: number;
  sunOpacity: number;
  /** 0 = pleno día, 1 = plena noche. Sirve para activar/desactivar aves, cometas, etc. */
  nightFactor: number;
}

interface RawKeyframe {
  t: number;
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogDensity: number;
  hemi: number;
  ambient: number;
  sunLight: number;
  sunColor: string;
  moonLight: number;
  moonColor: string;
  exposure: number;
  star: number;
  moon: number;
  sun: number;
  night: number;
}

// Un ciclo completo día → atardecer → noche → amanecer → día. El primer y
// último keyframe son idénticos para que el loop (t=1 → t=0) sea invisible.
//
// Principio clave (día-por-noche, como en el cine de animación): la
// iluminación NUNCA cae a valores extremadamente bajos. De noche, la luz
// del sol se apaga casi del todo, pero una luz de luna fría toma el relevo
// como luz de relleno — así los girasoles, el camino, la persona y el Pug
// conservan su color y su forma tridimensional en vez de volverse siluetas
// negras u planas.
const KEYFRAMES: RawKeyframe[] = [
  { t: 0.0, skyTop: '#8fb8d9', skyHorizon: '#ffd9a0', fog: '#f3d9ad', fogDensity: 0.009, hemi: 0.68, ambient: 0.35, sunLight: 1.75, sunColor: '#fff1cf', moonLight: 0, moonColor: '#aebbff', exposure: 1.05, star: 0, moon: 0, sun: 1, night: 0 },
  { t: 0.14, skyTop: '#8fb0c8', skyHorizon: '#ffe4a0', fog: '#f2d9ab', fogDensity: 0.01, hemi: 0.62, ambient: 0.36, sunLight: 1.5, sunColor: '#ffd9a0', moonLight: 0, moonColor: '#aebbff', exposure: 1.03, star: 0, moon: 0, sun: 1, night: 0.05 },
  { t: 0.22, skyTop: '#7d90b0', skyHorizon: '#ff9d5c', fog: '#e9a56e', fogDensity: 0.011, hemi: 0.56, ambient: 0.36, sunLight: 1.1, sunColor: '#ff9d5c', moonLight: 0.08, moonColor: '#aebbff', exposure: 1.0, star: 0.05, moon: 0.15, sun: 1, night: 0.25 },
  { t: 0.3, skyTop: '#5c6f9c', skyHorizon: '#e87692', fog: '#c98a92', fogDensity: 0.012, hemi: 0.52, ambient: 0.34, sunLight: 0.65, sunColor: '#e8798f', moonLight: 0.22, moonColor: '#a4b2f2', exposure: 0.98, star: 0.25, moon: 0.4, sun: 0.6, night: 0.5 },
  { t: 0.38, skyTop: '#3d4d80', skyHorizon: '#7a6b9e', fog: '#6b6a94', fogDensity: 0.013, hemi: 0.48, ambient: 0.31, sunLight: 0.32, sunColor: '#c98cae', moonLight: 0.45, moonColor: '#9caeee', exposure: 0.95, star: 0.55, moon: 0.65, sun: 0.22, night: 0.75 },
  { t: 0.5, skyTop: '#1c2750', skyHorizon: '#3a4178', fog: '#333b6b', fogDensity: 0.014, hemi: 0.44, ambient: 0.28, sunLight: 0.1, sunColor: '#8891c9', moonLight: 0.85, moonColor: '#aab4ff', exposure: 0.9, star: 1, moon: 1, sun: 0, night: 1 },
  { t: 0.62, skyTop: '#1c2750', skyHorizon: '#3a4178', fog: '#333b6b', fogDensity: 0.014, hemi: 0.44, ambient: 0.28, sunLight: 0.1, sunColor: '#8891c9', moonLight: 0.85, moonColor: '#aab4ff', exposure: 0.9, star: 1, moon: 1, sun: 0, night: 1 },
  { t: 0.7, skyTop: '#3d4d80', skyHorizon: '#7a6b9e', fog: '#6b6a94', fogDensity: 0.013, hemi: 0.48, ambient: 0.31, sunLight: 0.32, sunColor: '#c98cae', moonLight: 0.45, moonColor: '#9caeee', exposure: 0.95, star: 0.55, moon: 0.65, sun: 0.22, night: 0.75 },
  { t: 0.78, skyTop: '#5c6f9c', skyHorizon: '#f0879a', fog: '#d1919a', fogDensity: 0.012, hemi: 0.52, ambient: 0.34, sunLight: 0.65, sunColor: '#f0879a', moonLight: 0.22, moonColor: '#a4b2f2', exposure: 0.98, star: 0.25, moon: 0.4, sun: 0.6, night: 0.5 },
  { t: 0.86, skyTop: '#7d90b0', skyHorizon: '#ffab6c', fog: '#eaab74', fogDensity: 0.011, hemi: 0.56, ambient: 0.36, sunLight: 1.1, sunColor: '#ffab6c', moonLight: 0.08, moonColor: '#aebbff', exposure: 1.0, star: 0.05, moon: 0.15, sun: 1, night: 0.25 },
  { t: 0.94, skyTop: '#8fb0c8', skyHorizon: '#ffe4a0', fog: '#f2d9ab', fogDensity: 0.01, hemi: 0.62, ambient: 0.36, sunLight: 1.5, sunColor: '#ffd9a0', moonLight: 0, moonColor: '#aebbff', exposure: 1.03, star: 0, moon: 0, sun: 1, night: 0.05 },
  { t: 1.0, skyTop: '#8fb8d9', skyHorizon: '#ffd9a0', fog: '#f3d9ad', fogDensity: 0.009, hemi: 0.68, ambient: 0.35, sunLight: 1.75, sunColor: '#fff1cf', moonLight: 0, moonColor: '#aebbff', exposure: 1.05, star: 0, moon: 0, sun: 1, night: 0 },
];

const colorCache = new Map<string, THREE.Color>();
function col(hex: string): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

/** Progreso 0..1 del ciclo día/noche, continuo e infinito (usa módulo). */
export function getCycleProgress(distance: number): number {
  const p = (distance / CYCLE_LENGTH) % 1;
  return p < 0 ? p + 1 : p;
}

export function createSkyState(): SkyState {
  return {
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    fogColor: new THREE.Color(),
    fogDensity: 0,
    hemiIntensity: 0,
    ambientIntensity: 0,
    sunLightIntensity: 0,
    sunLightColor: new THREE.Color(),
    moonLightIntensity: 0,
    moonLightColor: new THREE.Color(),
    exposure: 1,
    starOpacity: 0,
    moonOpacity: 0,
    sunOpacity: 0,
    nightFactor: 0,
  };
}

/** Interpola el estado del cielo para un progreso de ciclo dado. Reutiliza
 * `out` (si se pasa) para no generar basura de GC en cada frame. */
export function getSkyState(cycleProgress: number, out?: SkyState): SkyState {
  let i = 0;
  while (i < KEYFRAMES.length - 2 && cycleProgress > KEYFRAMES[i + 1].t) i++;

  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];
  const span = b.t - a.t || 1;
  const localT = THREE.MathUtils.clamp((cycleProgress - a.t) / span, 0, 1);
  // smoothstep: transición sin quiebres de velocidad al cruzar cada keyframe.
  const eased = localT * localT * (3 - 2 * localT);

  const result = out ?? createSkyState();

  result.skyTop.copy(col(a.skyTop)).lerp(col(b.skyTop), eased);
  result.skyHorizon.copy(col(a.skyHorizon)).lerp(col(b.skyHorizon), eased);
  result.fogColor.copy(col(a.fog)).lerp(col(b.fog), eased);
  result.sunLightColor.copy(col(a.sunColor)).lerp(col(b.sunColor), eased);
  result.moonLightColor.copy(col(a.moonColor)).lerp(col(b.moonColor), eased);
  result.fogDensity = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, eased);
  result.hemiIntensity = THREE.MathUtils.lerp(a.hemi, b.hemi, eased);
  result.ambientIntensity = THREE.MathUtils.lerp(a.ambient, b.ambient, eased);
  result.sunLightIntensity = THREE.MathUtils.lerp(a.sunLight, b.sunLight, eased);
  result.moonLightIntensity = THREE.MathUtils.lerp(a.moonLight, b.moonLight, eased);
  result.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, eased);
  result.starOpacity = THREE.MathUtils.lerp(a.star, b.star, eased);
  result.moonOpacity = THREE.MathUtils.lerp(a.moon, b.moon, eased);
  result.sunOpacity = THREE.MathUtils.lerp(a.sun, b.sun, eased);
  result.nightFactor = THREE.MathUtils.lerp(a.night, b.night, eased);

  return result;
}
