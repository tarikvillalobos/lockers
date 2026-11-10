// Kit da fábrica: utilitários de geometria (em metros), texturas procedurais e materiais PBR.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
// progresso (0..1, suavizado) de u dentro da janela [a, b]
export const seg = (u, a, b) => smooth((u - a) / (b - a));
export const lin = (u, a, b) => clamp01((u - a) / (b - a));
// sobe em [a, b] e desce em [c, d]
export const pulse = (u, a, b, c, d) => seg(u, a, b) * (1 - seg(u, c, d));

let ANISO = 8;
export const setAnisotropy = (v) => (ANISO = v);

// ---------- geometria ----------
// y é sempre a BASE da peça (apoio no chão); x e z são o centro.
export function box(mat, w, h, d, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  return m;
}
export function rbox(mat, w, h, d, x = 0, y = 0, z = 0, r = 0.02, seg = 3) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), mat);
  m.position.set(x, y + h / 2, z);
  return m;
}
// cilindro: eixo 'y' → y é a base; eixos 'x' e 'z' → (x, y, z) é o centro
export function cyl(mat, r, h, x = 0, y = 0, z = 0, axis = 'y', segs = 24, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, h, segs);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, axis === 'y' ? y + h / 2 : y, z);
  return m;
}
export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}
export function at(obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}
// barra entre dois pontos (seção quadrada)
export function beam(mat, a, b, s = 0.08, s2 = s) {
  const A = new THREE.Vector3(...a),
    Bv = new THREE.Vector3(...b);
  const len = A.distanceTo(Bv);
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, len, s2), mat);
  m.position.copy(A).add(Bv).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
  return m;
}
export function tube(mat, pts, r = 0.02, closed = false, segs = 48, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', 0.3);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, radial, closed), mat);
}

// Funde todas as malhas estáticas de um grupo por material (menos chamadas de desenho).
// Malhas com userData.keep ou InstancedMesh ficam como estão.
export function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  const keep = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let k = o;
    let dyn = o.isInstancedMesh || o.isSkinnedMesh;
    let hidden = false;
    while (k) {
      if (k.userData.keep) dyn = true;
      if (!k.visible) hidden = true;
      k = k === root ? null : k.parent;
    }
    if (hidden) return;
    if (dyn || Array.isArray(o.material)) return keep.push(o);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow === false ? ':ns' : '') + (o.userData.noAO ? ':x' : '');
    if (!byMat.has(key)) byMat.set(key, { mat: o.material, geos: [], cast: o.castShadow !== false, recv: o.receiveShadow !== false, order: o.renderOrder });
    byMat.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  out.name = root.name;
  out.position.copy(root.position);
  out.quaternion.copy(root.quaternion);
  out.scale.copy(root.scale);
  for (const { mat, geos, cast, recv, order } of byMat.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    geos.forEach((g) => g.dispose());
    m.castShadow = cast;
    m.receiveShadow = recv;
    m.renderOrder = order;
    out.add(m);
  }
  for (const o of keep) {
    // preserva a pose no referencial da raiz
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    o.removeFromParent();
    m.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

// Funde as malhas filhas diretas de um grupo por material (os subgrupos, que se movem, ficam intactos)
export function bakeChildren(g) {
  const byMat = new Map();
  for (const c of [...g.children]) {
    if (!c.isMesh || c.isInstancedMesh || Array.isArray(c.material)) continue;
    c.updateMatrix();
    const geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    geo.clearGroups();
    geo.applyMatrix4(c.matrix);
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(geo);
    g.remove(c);
  }
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    geos.forEach((x) => x.dispose());
    m.castShadow = m.receiveShadow = !mat.transparent;
    g.add(m);
  }
  return g;
}

export function shadows(root, cast = true, recv = true) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.noShadow || o.material?.transparent) {
      o.castShadow = false;
      o.receiveShadow = recv && !o.material?.transparent;
      return;
    }
    o.castShadow = cast;
    o.receiveShadow = recv;
  });
  return root;
}

// ---------- texturas procedurais ----------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat, srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  t.anisotropy = ANISO;
  return t;
}
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function speckle(ctx, w, h, n, r, alpha, dark = true, seed = 3) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = dark ? Math.floor(R() * 60) : 200 + Math.floor(R() * 55);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * (0.4 + R() * 0.6)})`;
    const s = r * (0.4 + R() * 1.2);
    ctx.beginPath();
    ctx.arc(R() * w, R() * h, s, 0, TAU);
    ctx.fill();
  }
}

// micro-relevo do concreto (tons de cinza, ladrilhável)
export function concreteDetail() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#808080';
  x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 2600, 1.1, 0.16, true, 11);
  speckle(x, 512, 512, 2200, 1.0, 0.14, false, 23);
  speckle(x, 512, 512, 60, 9, 0.05, true, 5);
  speckle(x, 512, 512, 60, 12, 0.05, false, 8);
  return tex(c, { srgb: false });
}

// Piso da fábrica: concreto polido + juntas + manchas + pintura de demarcação (desenhada por `paint`)
// area: { x0, x1, z0, z1 } em metros. paint(ctx, P) recebe o contexto já em metros (x → direita, z → baixo).
export function floorTexture(area, paint, pxPerM = 64) {
  const W = Math.round((area.x1 - area.x0) * pxPerM),
    H = Math.round((area.z1 - area.z0) * pxPerM);
  const [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#9a9d9f');
  g.addColorStop(1, '#a4a7a8');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const R = rng(77);
  // nuvens de variação
  for (let i = 0; i < 520; i++) {
    const px = R() * W,
      py = R() * H,
      r = 60 + R() * 260;
    const gr = x.createRadialGradient(px, py, 0, px, py, r);
    const v = R() > 0.5 ? 255 : 0;
    gr.addColorStop(0, `rgba(${v},${v},${v},${0.022 + R() * 0.03})`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.fillStyle = gr;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  speckle(x, W, H, 16000, 1.2, 0.07, true, 4);
  speckle(x, W, H, 12000, 1.1, 0.06, false, 9);
  x.save();
  x.scale(pxPerM, pxPerM);
  x.translate(-area.x0, -area.z0);
  // juntas de dilatação a cada 6 m
  x.strokeStyle = 'rgba(40,42,44,0.34)';
  x.lineWidth = 0.022;
  x.beginPath();
  for (let gx = Math.ceil(area.x0 / 6) * 6; gx < area.x1; gx += 6) {
    x.moveTo(gx, area.z0);
    x.lineTo(gx, area.z1);
  }
  for (let gz = Math.ceil(area.z0 / 6) * 6; gz < area.z1; gz += 6) {
    x.moveTo(area.x0, gz);
    x.lineTo(area.x1, gz);
  }
  x.stroke();
  paint?.(x);
  x.restore();
  // marcas de pneu e desgaste por cima da pintura
  x.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = `rgba(60,60,62,${0.03 + R() * 0.05})`;
    x.lineWidth = 6 + R() * 10;
    x.beginPath();
    const px = R() * W,
      py = R() * H;
    x.moveTo(px, py);
    x.bezierCurveTo(px + (R() - 0.5) * 900, py + (R() - 0.5) * 240, px + (R() - 0.5) * 900, py + (R() - 0.5) * 240, px + (R() - 0.5) * 1400, py + (R() - 0.5) * 300);
    x.stroke();
  }
  x.globalCompositeOperation = 'source-over';
  const t = tex(c, { wrap: false });
  t.generateMipmaps = true;
  return t;
}

export function asphaltTexture() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#3c3e41';
  x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 5000, 1.2, 0.3, true, 2);
  speckle(x, 512, 512, 3600, 1.0, 0.16, false, 6);
  return tex(c, { repeat: [40, 24] });
}

// painel isotérmico de parede: nervuras verticais + faixa azul
export function wallTexture() {
  const [c, x] = canvas(512, 1024);
  x.fillStyle = '#e9ecee';
  x.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 512; i += 32) {
    const g = x.createLinearGradient(i, 0, i + 32, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.10)');
    g.addColorStop(0.08, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.2, 'rgba(0,0,0,0)');
    g.addColorStop(0.92, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    x.fillStyle = g;
    x.fillRect(i, 0, 32, 1024);
  }
  // juntas dos painéis
  x.fillStyle = 'rgba(0,0,0,0.12)';
  for (const y of [0, 340, 682]) x.fillRect(0, y, 512, 3);
  // faixa azul a ~1/3 da altura e rodapé cinza
  x.fillStyle = '#1f4fa3';
  x.fillRect(0, 1024 - 356, 512, 62);
  x.fillStyle = '#2a2d31';
  x.fillRect(0, 1024 - 34, 512, 34);
  speckle(x, 512, 1024, 900, 1.4, 0.03, true, 31);
  return tex(c);
}

export function ribbedTexture(color = '#3a3f45', dark = 0.18) {
  const [c, x] = canvas(256, 256);
  x.fillStyle = color;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 16) {
    const g = x.createLinearGradient(i, 0, i + 16, 0);
    g.addColorStop(0, `rgba(0,0,0,${dark})`);
    g.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, `rgba(0,0,0,${dark})`);
    x.fillStyle = g;
    x.fillRect(i, 0, 16, 256);
  }
  return tex(c);
}

export function hazardTexture(a = '#f6c400', b = '#16181a') {
  const [c, x] = canvas(256, 256);
  x.fillStyle = a;
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = b;
  for (let i = -256; i < 512; i += 128) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 64, 0);
    x.lineTo(i + 64 + 256, 256);
    x.lineTo(i + 256, 256);
    x.fill();
  }
  return tex(c);
}

export function woodTexture() {
  const [c, x] = canvas(512, 256);
  x.fillStyle = '#c9a26b';
  x.fillRect(0, 0, 512, 256);
  const R = rng(5);
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = `rgba(${90 + R() * 50},${60 + R() * 30},${30 + R() * 20},${0.08 + R() * 0.14})`;
    x.lineWidth = 0.6 + R() * 1.6;
    const y = R() * 256;
    x.beginPath();
    x.moveTo(0, y);
    x.bezierCurveTo(170, y + (R() - 0.5) * 12, 340, y + (R() - 0.5) * 12, 512, y + (R() - 0.5) * 8);
    x.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const px = R() * 512,
      py = R() * 256;
    const g = x.createRadialGradient(px, py, 0, px, py, 9);
    g.addColorStop(0, 'rgba(70,40,20,0.6)');
    g.addColorStop(1, 'rgba(70,40,20,0)');
    x.fillStyle = g;
    x.fillRect(px - 10, py - 10, 20, 20);
  }
  return tex(c);
}

// caixa de papelão da embalagem: fibras + impressão
export function cartonTexture(face = 'front') {
  const [c, x] = canvas(512, 1024);
  x.fillStyle = '#c59a62';
  x.fillRect(0, 0, 512, 1024);
  const R = rng(face.length * 7 + 1);
  for (let i = 0; i < 1500; i++) {
    x.strokeStyle = `rgba(${120 + R() * 60},${80 + R() * 40},${40 + R() * 30},${0.05 + R() * 0.08})`;
    x.lineWidth = 0.5 + R();
    const px = R() * 512,
      py = R() * 1024;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (R() - 0.5) * 6, py + 20 + R() * 60);
    x.stroke();
  }
  x.fillStyle = 'rgba(40,26,14,0.86)';
  x.textAlign = 'center';
  if (face === 'front') {
    x.font = '700 58px Barlow, Arial, sans-serif';
    x.fillText('LOCKER', 256, 250);
    x.font = '500 34px Barlow, Arial, sans-serif';
    x.fillText('RESIDENCIAL', 256, 296);
    x.font = '600 26px "IBM Plex Mono", monospace';
    x.fillText('LR-1020', 256, 346);
    x.lineWidth = 5;
    x.strokeStyle = 'rgba(40,26,14,0.86)';
    x.strokeRect(96, 170, 320, 208);
    // setas "este lado para cima" e frágil
    for (const px of [176, 336]) {
      x.beginPath();
      x.moveTo(px, 700);
      x.lineTo(px, 610);
      x.moveTo(px - 26, 640);
      x.lineTo(px, 606);
      x.lineTo(px + 26, 640);
      x.stroke();
    }
    x.fillRect(140, 716, 232, 6);
    x.font = '500 20px "IBM Plex Mono", monospace';
    x.fillText('ESTE LADO PARA CIMA', 256, 760);
    x.fillText('410 × 380 × 1020 mm · 52 kg', 256, 880);
  } else {
    // etiqueta de expedição
    x.fillStyle = '#f4f1ea';
    x.fillRect(150, 300, 212, 150);
    x.fillStyle = '#1b1b1b';
    for (let i = 0; i < 34; i++) x.fillRect(166 + i * 5.4, 318, 1 + (i * 7) % 4, 60);
    x.font = '500 15px "IBM Plex Mono", monospace';
    x.fillText('LR-1020 · RAL 7016', 256, 404);
    x.fillText('LOTE 2611 · BR', 256, 428);
  }
  // fita
  x.fillStyle = 'rgba(210,180,130,0.55)';
  x.fillRect(226, 0, 60, 90);
  const t = tex(c, { wrap: false });
  return t;
}

// tela de arame (alfa)
export function meshTexture() {
  const [c, x] = canvas(128, 128);
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(30,32,34,1)';
  x.lineWidth = 5;
  for (let i = 0; i <= 128; i += 32) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 128);
    x.moveTo(0, i);
    x.lineTo(128, i);
    x.stroke();
  }
  return tex(c);
}

export function glowTexture() {
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return tex(c, { wrap: false });
}

// placa com texto (sinalização, painéis de máquina)
export function signTexture(lines, { w = 1024, h = 256, bg = '#1f4fa3', fg = '#ffffff', size = 110, sub = 44, mono = false, align = 'center', accent } = {}) {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  if (accent) {
    x.fillStyle = accent;
    x.fillRect(0, 0, h * 0.09, h);
  }
  x.fillStyle = fg;
  x.textAlign = align;
  x.textBaseline = 'middle';
  const tx = align === 'center' ? w / 2 : h * 0.2;
  const arr = Array.isArray(lines) ? lines : [lines];
  if (arr.length === 1) {
    x.font = `700 ${size}px ${mono ? '"IBM Plex Mono", monospace' : 'Barlow, Arial, sans-serif'}`;
    x.fillText(arr[0], tx, h / 2 + 4);
  } else {
    x.font = `700 ${size}px Barlow, Arial, sans-serif`;
    x.fillText(arr[0], tx, h * 0.4);
    x.font = `500 ${sub}px "IBM Plex Mono", monospace`;
    x.globalAlpha = 0.85;
    x.fillText(arr[1], tx, h * 0.76);
  }
  return tex(c, { wrap: false });
}

// tela de IHM (emissiva)
export function screenTexture(title, rows = [], { color = '#39d98a', w = 512, h = 320 } = {}) {
  const [c, x] = canvas(w, h);
  x.fillStyle = '#0b1016';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#131b25';
  x.fillRect(0, 0, w, 54);
  x.fillStyle = '#e8eef5';
  x.font = '600 26px Barlow, Arial, sans-serif';
  x.textBaseline = 'middle';
  x.fillText(title, 18, 28);
  x.fillStyle = color;
  x.beginPath();
  x.arc(w - 28, 28, 9, 0, TAU);
  x.fill();
  x.font = '500 19px "IBM Plex Mono", monospace';
  rows.forEach(([k, v, bar], i) => {
    const y = 86 + i * 44;
    x.fillStyle = '#8b98a8';
    x.fillText(k, 18, y);
    x.fillStyle = '#e8eef5';
    x.textAlign = 'right';
    x.fillText(v, w - 18, y);
    x.textAlign = 'left';
    if (bar != null) {
      x.fillStyle = '#1c2733';
      x.fillRect(18, y + 14, w - 36, 6);
      x.fillStyle = color;
      x.fillRect(18, y + 14, (w - 36) * bar, 6);
    }
  });
  return tex(c, { wrap: false });
}

// ---------- materiais ----------
export const M = {};
export function initMaterials() {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const detail = concreteDetail();
  Object.assign(M, {
    // máquinas
    white: P({ color: '#e7eaec', roughness: 0.42, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    light: P({ color: '#c9ced3', roughness: 0.5, metalness: 0.1, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    anthracite: P({ color: '#2b3036', roughness: 0.5, metalness: 0.25, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    dark: S({ color: '#17191c', roughness: 0.62, metalness: 0.35 }),
    blue: P({ color: '#1f4fa3', roughness: 0.42, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    orange: P({ color: '#ef6a1a', roughness: 0.42, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    robot: P({ color: '#f4a70b', roughness: 0.36, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    safety: P({ color: '#f6c400', roughness: 0.5, metalness: 0.05, clearcoat: 0.2 }),
    red: P({ color: '#c8281e', roughness: 0.45, metalness: 0.1, clearcoat: 0.3 }),
    green: P({ color: '#1f9d55', roughness: 0.5, metalness: 0.05 }),
    // metais
    steel: P({ color: '#b4bac0', roughness: 0.34, metalness: 0.92 }),
    sheet: P({ color: '#b6bcc2', roughness: 0.36, metalness: 0.85 }),
    galv: P({ color: '#c2c9ce', roughness: 0.45, metalness: 0.85 }),
    alu: P({ color: '#d2d6da', roughness: 0.38, metalness: 0.9 }),
    chrome: P({ color: '#eef0f2', roughness: 0.12, metalness: 1 }),
    iron: S({ color: '#4a4f55', roughness: 0.6, metalness: 0.7 }),
    copper: P({ color: '#c97a45', roughness: 0.3, metalness: 1 }),
    // diversos
    rubber: S({ color: '#121314', roughness: 0.92, metalness: 0 }),
    plastic: S({ color: '#22262b', roughness: 0.55, metalness: 0.05 }),
    glass: P({ color: '#9fc6d8', roughness: 0.06, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }),
    glassDark: P({ color: '#12382a', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false }),
    curtain: P({ color: '#e8742a', roughness: 0.35, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }),
    film: P({ color: '#dfeaf2', roughness: 0.15, transparent: true, opacity: 0.0, depthWrite: false, clearcoat: 1 }),
    wood: S({ map: woodTexture(), roughness: 0.82, metalness: 0 }),
    hazard: S({ map: hazardTexture(), roughness: 0.6, metalness: 0.05 }),
    mesh: S({ map: meshTexture(), alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6, color: '#3a3d40' }),
    concrete: S({ color: '#8b8e90', roughness: 0.85, metalness: 0, bumpMap: detail, bumpScale: 0.6 }),
    roof: S({ map: ribbedTexture('#d9dde0', 0.1), roughness: 0.7, metalness: 0.2 }),
    insul: S({ map: ribbedTexture('#cfd4d8', 0.12), roughness: 0.55, metalness: 0.3 }),
    // emissivos
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.3) }),
    ledGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 0.9) }),
    ledRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.25, 0.2) }),
    ledAmber: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.2) }),
    ledBlue: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.2, 2.8) }),
    ledOff: S({ color: '#30343a', roughness: 0.4 }),
    hot: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.25) }),
  });
  for (const k of ['steel', 'sheet', 'galv', 'alu', 'chrome', 'copper']) M[k].envMapIntensity = 2.4;
  M.detail = detail;
  for (const m of Object.values(M)) if (m.isMaterial && m.map) m.map.anisotropy = ANISO;
  return M;
}

// tela/placa plana com textura (emissive = brilha no escuro)
export function panel(texture, w, h, { emissive = false, intensity = 1.2, double = false } = {}) {
  const mat = emissive
    ? new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(intensity, intensity, intensity), side: double ? THREE.DoubleSide : THREE.FrontSide })
    : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.05, side: double ? THREE.DoubleSide : THREE.FrontSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.noShadow = true;
  return m;
}
