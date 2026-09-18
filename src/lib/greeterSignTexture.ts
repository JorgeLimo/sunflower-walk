import * as THREE from 'three';
import { colors } from './colors';
import { GREETER_PHRASES } from './greeterContent';

const SIGN_TEXTURE_W = 480;
const SIGN_TEXTURE_H = 320;

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Reparte `text` en líneas que no excedan `maxWidth`, con el `ctx.font` ya
 * fijado por el llamador. Ajuste simple palabra por palabra: suficiente
 * para frases cortas, no hace falta nada más sofisticado. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Cartel de madera cálida con el texto centrado: mismo enfoque de textura
 * de canvas ya usado en `Moon.tsx`/`Road.tsx` (generado UNA sola vez, nunca
 * por cuadro). Solo hay 15 frases fijas, así que se generan las 15 texturas
 * al cargar el módulo (`GREETER_SIGN_TEXTURES` más abajo) y cada personita
 * simplemente referencia la que le toca — nunca se crea una por instancia.
 *
 * El tamaño de fuente baja automáticamente si la frase es larga (p. ej.
 * "Mira todo lo que has avanzado") hasta que el bloque de líneas entra en
 * el cartel, para que el texto nunca se salga del borde ni quede diminuto
 * en las frases cortas.
 */
function createSignTexture(text: string): THREE.CanvasTexture {
  const w = SIGN_TEXTURE_W;
  const h = SIGN_TEXTURE_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Marco de madera cálida por fuera, tabla clara por dentro — diseño
  // sencillo de dos capas, coherente con el resto del mundo (mismos tonos
  // que el borde del camino y el papel/tinta ya usados en otras partes).
  const margin = 10;
  ctx.fillStyle = colors.roadEdge;
  roundedRectPath(ctx, margin, margin, w - margin * 2, h - margin * 2, 34);
  ctx.fill();

  const inner = margin + 16;
  ctx.fillStyle = colors.paper;
  roundedRectPath(ctx, inner, inner, w - inner * 2, h - inner * 2, 24);
  ctx.fill();

  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxTextWidth = w - inner * 2 - 36;
  const maxTextHeight = h - inner * 2 - 24;
  let fontSize = 64;
  let lines: string[] = [];
  let lineHeight = 0;
  while (fontSize > 28) {
    ctx.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    lines = wrapLines(ctx, text, maxTextWidth);
    lineHeight = fontSize * 1.2;
    if (lines.length * lineHeight <= maxTextHeight) break;
    fontSize -= 4;
  }

  const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, startY + i * lineHeight);
  });

  return new THREE.CanvasTexture(canvas);
}

/** Una textura precomputada por frase (hay 15), compartida por todas las
 * personitas que la sostengan — nunca se regenera en tiempo real. */
export const GREETER_SIGN_TEXTURES: THREE.CanvasTexture[] = GREETER_PHRASES.map((phrase) => createSignTexture(phrase));

export const SIGN_ASPECT = SIGN_TEXTURE_W / SIGN_TEXTURE_H;

/** Halo cálido para de noche: un degradado radial suave (mismo recurso que
 * el resplandor de la luna en `Moon.tsx`), pensado para un sprite aditivo
 * detrás del cartel — nunca se regenera, es una única textura compartida
 * por todas las personitas. */
function createSignGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 222, 168, 0.85)');
  gradient.addColorStop(0.4, 'rgba(255, 196, 130, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 196, 130, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export const GREETER_SIGN_GLOW_TEXTURE: THREE.CanvasTexture = createSignGlowTexture();
