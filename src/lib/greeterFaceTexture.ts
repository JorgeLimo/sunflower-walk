import * as THREE from 'three';
import { colors } from './colors';

const FACE_SIZE = 224;
const VARIANT_COUNT = 4;

/** Dibuja una carita simple y cálida: sonrojo, cejas, ojos (redondos o
 * felices/cerrados según la variante) y una sonrisa amplia. Todo sobre un
 * canvas transparente (nunca se pinta el fondo) para que solo se vea la
 * carita al mapearla sobre un plano — mismo mecanismo que las texturas de
 * los carteles, aplicado acá como una "calcomanía" sobre la cabeza.
 *
 * Resolución más alta y trazos más gruesos que la primera versión: de cerca
 * (la personita ya asoma sobre el follaje) los rasgos finos se perdían y la
 * cara se leía como un par de puntos borrosos en vez de una expresión
 * reconocible — el pedido explícito de "ojos y sonrisas claramente
 * reconocibles" apunta justo a eso. */
function drawFace(ctx: CanvasRenderingContext2D, variant: number) {
  const c = FACE_SIZE / 2;

  // Sonrojo primero, para que quede debajo de cejas/ojos/sonrisa.
  const blushDX = FACE_SIZE * 0.27;
  const blushY = c + FACE_SIZE * 0.09;
  const blushR = FACE_SIZE * 0.1;
  ctx.fillStyle = 'rgba(224, 122, 108, 0.42)';
  ctx.beginPath();
  ctx.ellipse(c - blushDX, blushY, blushR, blushR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c + blushDX, blushY, blushR, blushR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.ink;
  ctx.strokeStyle = colors.ink;
  ctx.lineCap = 'round';

  const eyeDX = FACE_SIZE * 0.175;
  const eyeY = c - FACE_SIZE * 0.055;

  // Cejas: un trazo corto y curvo apenas arriba de cada ojo — es lo que más
  // suma a que la cara se lea "expresiva" en vez de solo "presente".
  ctx.lineWidth = FACE_SIZE * 0.028;
  const browY = eyeY - FACE_SIZE * 0.1;
  const browTilt = variant % 2 === 0 ? 0.12 : 0.05;
  ctx.beginPath();
  ctx.arc(c - eyeDX, browY, FACE_SIZE * 0.07, Math.PI * (1.15 + browTilt), Math.PI * (1.55 + browTilt));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c + eyeDX, browY, FACE_SIZE * 0.07, Math.PI * (1.45 - browTilt), Math.PI * (1.85 - browTilt));
  ctx.stroke();

  // La mitad de las variantes lleva ojos redondos simples (con un chispazo
  // de luz para que no se vean como puntos planos); la otra mitad, ojitos
  // felices cerrados (un arco hacia arriba) — la variación más notoria
  // entre personitas, para que no se sientan copias exactas.
  if (variant % 2 === 0) {
    const r = FACE_SIZE * 0.052;
    ctx.fillStyle = colors.ink;
    ctx.beginPath();
    ctx.arc(c - eyeDX, eyeY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c + eyeDX, eyeY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    const glintR = r * 0.32;
    ctx.beginPath();
    ctx.arc(c - eyeDX + r * 0.32, eyeY - r * 0.32, glintR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c + eyeDX + r * 0.32, eyeY - r * 0.32, glintR, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = FACE_SIZE * 0.055;
    const r = FACE_SIZE * 0.065;
    ctx.beginPath();
    ctx.arc(c - eyeDX, eyeY + r * 0.5, r, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c + eyeDX, eyeY + r * 0.5, r, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  // Sonrisa amplia (arco inferior), trazo grueso; el ancho varía un poco
  // por variante.
  ctx.lineWidth = FACE_SIZE * 0.045;
  const smileR = FACE_SIZE * (0.17 + (variant % 3) * 0.013);
  const smileY = c + FACE_SIZE * 0.065;
  ctx.beginPath();
  ctx.arc(c, smileY, smileR, Math.PI * 0.08, Math.PI * 0.92);
  ctx.stroke();
}

function createFaceTexture(variant: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_SIZE;
  canvas.height = FACE_SIZE;
  const ctx = canvas.getContext('2d')!;
  drawFace(ctx, variant);
  return new THREE.CanvasTexture(canvas);
}

/** Unas pocas caritas precomputadas (nunca una por instancia): cada
 * personita solo referencia la que le toca por `faceIndex`. */
export const GREETER_FACE_TEXTURES: THREE.CanvasTexture[] = Array.from({ length: VARIANT_COUNT }, (_, i) =>
  createFaceTexture(i),
);

export const GREETER_FACE_COUNT = GREETER_FACE_TEXTURES.length;
