import * as THREE from 'three';
import { colors } from './colors';

const FACE_SIZE = 160;
const VARIANT_COUNT = 4;

/** Dibuja una carita simple y cálida: sonrojo, ojos (redondos o felices/
 * cerrados según la variante) y una sonrisa amplia. Todo sobre un canvas
 * transparente (nunca se pinta el fondo) para que solo se vea la carita al
 * mapearla sobre un plano — mismo mecanismo que las texturas de los
 * carteles, aplicado acá como una "calcomanía" sobre la cabeza. */
function drawFace(ctx: CanvasRenderingContext2D, variant: number) {
  const c = FACE_SIZE / 2;

  // Sonrojo primero, para que quede debajo de ojos/sonrisa.
  const blushDX = FACE_SIZE * 0.27;
  const blushY = c + FACE_SIZE * 0.08;
  const blushR = FACE_SIZE * 0.09;
  ctx.fillStyle = 'rgba(224, 122, 108, 0.4)';
  ctx.beginPath();
  ctx.ellipse(c - blushDX, blushY, blushR, blushR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c + blushDX, blushY, blushR, blushR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.ink;
  ctx.strokeStyle = colors.ink;
  ctx.lineCap = 'round';
  ctx.lineWidth = FACE_SIZE * 0.05;

  // La mitad de las variantes lleva ojos redondos simples; la otra mitad,
  // ojitos felices cerrados (un arco hacia arriba) — la variación más
  // notoria entre personitas, para que no se sientan copias exactas.
  const eyeDX = FACE_SIZE * 0.17;
  const eyeY = c - FACE_SIZE * 0.05;
  if (variant % 2 === 0) {
    const r = FACE_SIZE * 0.042;
    ctx.beginPath();
    ctx.arc(c - eyeDX, eyeY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c + eyeDX, eyeY, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const r = FACE_SIZE * 0.06;
    ctx.beginPath();
    ctx.arc(c - eyeDX, eyeY + r * 0.5, r, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c + eyeDX, eyeY + r * 0.5, r, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  // Sonrisa amplia (arco inferior); el ancho varía un poco por variante.
  const smileR = FACE_SIZE * (0.16 + (variant % 3) * 0.012);
  const smileY = c + FACE_SIZE * 0.06;
  ctx.beginPath();
  ctx.arc(c, smileY, smileR, Math.PI * 0.1, Math.PI * 0.9);
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
