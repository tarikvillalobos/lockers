import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Papelão ondulado: cor base + ruído + caneluras sutis
function drawCardboard(ctx, w, h, base) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let x = 0; x < w; x += 6) ctx.fillRect(x, 0, 2, h);
  ctx.globalAlpha = 1;
}

function drawTape(ctx, w, h) {
  ctx.fillStyle = 'rgba(214, 178, 120, 0.85)';
  ctx.fillRect(0, h * 0.4, w, h * 0.2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, h * 0.42, w, h * 0.03);
}

function drawLabel(ctx, w, h, code) {
  const lw = w * 0.46,
    lh = h * 0.34,
    lx = w * 0.08,
    ly = h * 0.08;
  ctx.fillStyle = '#f7f6f2';
  ctx.fillRect(lx, ly, lw, lh);
  ctx.fillStyle = '#1f2226';
  ctx.font = `600 ${Math.round(lh * 0.13)}px Barlow, Arial, sans-serif`;
  ctx.fillText('ENCOMENDA', lx + lw * 0.06, ly + lh * 0.2);
  ctx.font = `${Math.round(lh * 0.1)}px "IBM Plex Mono", monospace`;
  ctx.fillText(code, lx + lw * 0.06, ly + lh * 0.35);
  // código de barras
  let x = lx + lw * 0.06;
  const bx1 = lx + lw * 0.94;
  while (x < bx1) {
    const bw = 1 + Math.floor(Math.random() * 3);
    if (Math.random() > 0.35) ctx.fillRect(x, ly + lh * 0.48, bw, lh * 0.36);
    x += bw + 1;
  }
}

const BROWNS = ['#b98c5c', '#c49a68', '#a97d50', '#c8a274', '#b48654'];

// Retorna o array de 6 materiais para BoxGeometry: [+x, -x, +y, -y, +z, -z]
export function createParcelMaterials() {
  const base = BROWNS[Math.floor(Math.random() * BROWNS.length)];
  const code = 'BR' + Math.floor(1e8 + Math.random() * 9e8) + 'XX';
  const mk = (draw) => {
    const [c, ctx] = canvas(256, 256);
    drawCardboard(ctx, 256, 256, base);
    draw?.(ctx);
    return new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.88, metalness: 0 });
  };
  const plain = mk();
  const tape = mk((ctx) => drawTape(ctx, 256, 256));
  const label = mk((ctx) => drawLabel(ctx, 256, 256, code));
  const labelTape = mk((ctx) => {
    drawTape(ctx, 256, 256);
    drawLabel(ctx, 256, 256, code);
  });
  return { list: [plain, plain, tape, label, tape, labelTape], code };
}

// Gravação "ENCOMENDAS" na testeira
export function createHeaderDecal() {
  const [c, ctx] = canvas(1024, 192);
  ctx.clearRect(0, 0, 1024, 192);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 70px Barlow, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '18px';
  ctx.fillText('ENCOMENDAS', 512, 100);
  const t = tex(c);
  return t;
}

// Seta de depósito na face do basculante
export function createArrowDecal() {
  const [c, ctx] = canvas(256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(128, 40);
  ctx.lineTo(128, 200);
  ctx.moveTo(70, 145);
  ctx.lineTo(128, 205);
  ctx.lineTo(186, 145);
  ctx.stroke();
  return tex(c);
}

// Sombra de contato suave sob o gabinete
export function createContactShadow() {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
