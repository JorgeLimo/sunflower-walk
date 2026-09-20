import * as THREE from 'three';

/** Mensaje de la bandera: siempre el mismo, en UNA sola línea. */
export const BANNER_TEXT = 'You’re doing great, keep going!';

export interface BannerTexture {
  texture: THREE.CanvasTexture;
  /** ancho / alto de la tela. */
  aspect: number;
  /** Alto de la letra como fracción del ancho de la tela: sirve para
   * dimensionar la bandera de modo que la letra mida lo mismo en pantalla
   * que antes, sin dejar espacio vacío de sobra. */
  textFraction: number;
}

const FONT_PX = 120;

/** Girasol pequeño dibujado a mano sobre la tela (dos vueltas de pétalos,
 * centro pardo con semillas). Vectorial a propósito: no depende de que el
 * navegador tenga una fuente de emojis. */
function drawSunflower(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const ring = (count: number, offset: number, dist: number, rx: number, ry: number, fill: string, stroke: string) => {
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r * dist, cy + Math.sin(a) * r * dist);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * rx, r * ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();
    }
  };
  ring(12, 0, 0.66, 0.36, 0.17, '#f0a91f', '#b9741a');
  ring(12, Math.PI / 12, 0.58, 0.34, 0.16, '#fbd142', '#d99a22');

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#6b4526';
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 210, 140, 0.55)';
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    const d = r * 0.26 * Math.sqrt((i + 0.5) / 7);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Tela de bandera con el mensaje "impreso" en una sola línea, precedido de un
 * pequeño girasol: fondo crema con dos vivos cálidos arriba y abajo y letra
 * firme (misma familia tipográfica que los carteles y las burbujas). El
 * lienzo se mide a partir del propio texto, así que la tela queda compacta,
 * con poco espacio vacío alrededor. Se genera una sola vez.
 */
function createBanner(): BannerTexture {
  const measure = document.createElement('canvas').getContext('2d')!;
  const font = `700 ${FONT_PX}px "Segoe UI", system-ui, sans-serif`;
  measure.font = font;
  const textWidth = measure.measureText(BANNER_TEXT).width;

  // El girasol es un poco más chico que la altura de la letra.
  const icon = FONT_PX * 0.76;
  const gap = FONT_PX * 0.42;
  const pad = FONT_PX * 0.8;
  const w = Math.ceil(pad + icon + gap + textWidth + pad);
  const h = Math.ceil(FONT_PX * 1.85);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fff8ea';
  ctx.fillRect(0, 0, w, h);

  // Vivos cálidos en los bordes superior e inferior.
  const trim = Math.round(h * 0.075);
  const line = Math.max(2, Math.round(h * 0.013));
  ctx.fillStyle = '#e59a62';
  ctx.fillRect(0, 0, w, trim);
  ctx.fillRect(0, h - trim, w, trim);
  ctx.fillStyle = 'rgba(217, 105, 79, 0.85)';
  ctx.fillRect(0, trim, w, line);
  ctx.fillRect(0, h - trim - line, w, line);

  drawSunflower(ctx, pad + icon / 2, h / 2, icon / 2);

  ctx.fillStyle = '#3a2d24';
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(BANNER_TEXT, pad + icon + gap, h / 2 + FONT_PX * 0.04);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return { texture, aspect: w / h, textFraction: FONT_PX / w };
}

export const BANNER = createBanner();
