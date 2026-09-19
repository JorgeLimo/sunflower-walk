import * as THREE from 'three';

/** Mensaje de la bandera: siempre el mismo. */
export const BANNER_LINES_WIDE = ['Lo estás haciendo muy bien,', 'sigue adelante'];
export const BANNER_LINES_TALL = ['Lo estás haciendo', 'muy bien,', 'sigue adelante'];

/** Fracción del tamaño máximo de letra que entra en la tela. */
const TEXT_SCALE = 0.9;

export interface BannerTexture {
  texture: THREE.CanvasTexture;
  /** ancho / alto de la tela. */
  aspect: number;
}

/**
 * Tela de bandera con el mensaje "impreso": fondo crema con dos vivos
 * cálidos arriba y abajo y letra firme (misma familia tipográfica que los
 * carteles y las burbujas). Una versión de 2 líneas para pantallas anchas y
 * una de 3 líneas, más alta, para móvil en vertical — así el texto conserva
 * un tamaño legible en ambos casos. Se genera una sola vez.
 */
function createBanner(lines: string[], w: number, h: number): BannerTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fff8ea';
  ctx.fillRect(0, 0, w, h);

  // Vivos cálidos en los bordes superior e inferior.
  const trim = Math.round(h * 0.07);
  ctx.fillStyle = '#e59a62';
  ctx.fillRect(0, 0, w, trim);
  ctx.fillRect(0, h - trim, w, trim);
  ctx.fillStyle = 'rgba(217, 105, 79, 0.85)';
  ctx.fillRect(0, trim, w, Math.max(2, Math.round(h * 0.012)));
  ctx.fillRect(0, h - trim - Math.max(2, Math.round(h * 0.012)), w, Math.max(2, Math.round(h * 0.012)));

  ctx.fillStyle = '#3a2d24';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = w * 0.045;
  const usableH = h - trim * 2 - h * 0.12;
  let size = 200;
  let lineHeight = 0;
  while (size > 16) {
    ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
    lineHeight = size * 1.18;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= w - padX * 2 && lines.length * lineHeight <= usableH) break;
    size -= 4;
  }

  // Un poco por debajo del máximo que entra, para dejar aire alrededor de la
  // frase dentro de la tela.
  size = Math.round(size * TEXT_SCALE);
  ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
  lineHeight = size * 1.18;

  const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineHeight));

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return { texture, aspect: w / h };
}

export const BANNER_WIDE = createBanner(BANNER_LINES_WIDE, 2000, 460);
export const BANNER_TALL = createBanner(BANNER_LINES_TALL, 1300, 470);
