// Motor de chapa metálica (sem three.js: roda no navegador e no Node).
//
// Uma peça é uma FACE base (retângulo w × h ou contorno livre) com ABAS presas nas bordas. Cada aba é
// outra face (largura = trecho da borda, altura = `len`), dobrada em `angle` graus para CIMA (lado +n da
// face) ou para BAIXO, e pode ter as próprias abas. Todas as medidas são EXTERNAS (como no SolidWorks):
// a altura da aba é medida da linha de molde externa.
//
// Planificação: a face pai fica como está e cada aba entra com `len − BD` (BD = desconto de dobra). A linha
// de dobra fica BD/2 para dentro da borda externa do pai. Assim o desenvolvido de A + B dobrados em 90°
// mede A + B − BD, que é a regra usual de fábrica.

import polygonClipping from 'polygon-clipping';

export const K_FACTOR = 0.42; // dobra no ar, raio interno ≈ espessura
export const STEEL_DENSITY = 7.85e-6; // kg/mm³

export const bendAllowance = (t, r, deg, k = K_FACTOR) => ((deg * Math.PI) / 180) * (r + k * t);
export function bendDeduction(t, r, deg, k = K_FACTOR) {
  const a = Math.min(Math.abs(deg), 90);
  return 2 * Math.tan((a * Math.PI) / 360) * (r + t) - bendAllowance(t, r, a, k);
}

const EDGE = ['top', 'right', 'bottom', 'left'];

// Trecho da borda onde a aba nasce, percorrido no sentido horário (visto de +n): p0 → p1.
// O eixo u' da aba segue p0 → p1 e o v' aponta para fora da face.
export function edgeSegment(face, fl) {
  if (fl.p0) return [fl.p0, fl.p1];
  const { w, h } = face;
  const i0 = fl.i0 ?? 0,
    i1 = fl.i1 ?? 0;
  switch (fl.edge) {
    case 'top':
      return [[i0, h], [w - i1, h]];
    case 'right':
      return [[w, h - i0], [w, i1]];
    case 'bottom':
      return [[w - i0, 0], [i1, 0]];
    case 'left':
      return [[0, i0], [0, h - i1]];
    default:
      throw new Error(`borda inválida: ${fl.edge}`);
  }
}

// Percorre a árvore de faces. Para cada face chama visit({ face, parent, bend, depth, seg, L }).
export function walkFaces(part, visit) {
  const rec = (face, parent, bend, depth) => {
    visit({ face, parent, bend, depth });
    for (const fl of face.flanges ?? []) {
      const seg = edgeSegment(face, fl);
      const L = Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]);
      fl.w = L;
      fl.h = fl.len;
      rec(fl, face, { seg, L, angle: fl.angle ?? 90, dir: fl.dir ?? 'up' }, depth + 1);
    }
  };
  rec(part, null, null, 0);
}

const rectRing = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i],
      [x1, y1] = r[(i + 1) % r.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
function ringLength(r) {
  let l = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i],
      [x1, y1] = r[(i + 1) % r.length];
    l += Math.hypot(x1 - x0, y1 - y0);
  }
  return l;
}

// Remove o ponto de fechamento repetido e os pontos colineares
function cleanRing(ring) {
  let r = ring.slice();
  if (r.length > 1 && Math.abs(r[0][0] - r[r.length - 1][0]) < 1e-9 && Math.abs(r[0][1] - r[r.length - 1][1]) < 1e-9) r.pop();
  const out = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[(i + r.length - 1) % r.length],
      b = r[i],
      c = r[(i + 1) % r.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-6) out.push([b[0], b[1]]);
  }
  return out;
}

// Contorno de um furo não circular, na ordem do polígono
export function holeRing(hd) {
  if (hd.type === 'rect') return rectRing(hd.u, hd.v, hd.u + hd.w, hd.v + hd.h);
  if (hd.type === 'poly') return hd.pts.map((p) => [p[0], p[1]]);
  if (hd.type === 'slot') {
    // oblongo: centro (u, v), comprimento total len, largura d, eixo em `ang` graus
    const n = 10,
      r = hd.d / 2,
      half = hd.len / 2 - r,
      a = ((hd.ang ?? 0) * Math.PI) / 180;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = -Math.PI / 2 + (Math.PI * i) / n;
      pts.push([half + r * Math.cos(t), r * Math.sin(t)]);
    }
    for (let i = 0; i <= n; i++) {
      const t = Math.PI / 2 + (Math.PI * i) / n;
      pts.push([-half + r * Math.cos(t), r * Math.sin(t)]);
    }
    return pts.map(([x, y]) => [hd.u + x * Math.cos(a) - y * Math.sin(a), hd.v + x * Math.sin(a) + y * Math.cos(a)]);
  }
  return null;
}

// Planificação da peça: contornos de corte, furos, linhas de dobra e números de processo.
export function flatPattern(part) {
  const t = part.t,
    r = part.r ?? part.t;
  const faces = []; // anéis de cada face, em coordenadas planas
  const cuts = []; // recortes não circulares
  const circles = [];
  const bends = [];

  const rec = (face, T, bd) => {
    // T: transformação 2D { c, s, x, y }; bd: desconto na raiz desta face (0 na base)
    const mapV = (v) => (bd === 0 ? v : v <= 1e-9 ? -bd / 2 : v - bd);
    const P = (u, v) => {
      const vv = mapV(v);
      return [T.x + T.c * u - T.s * vv, T.y + T.s * u + T.c * vv];
    };
    const outline = face.outline ?? rectRing(0, 0, face.w, face.h);
    faces.push([outline.map(([u, v]) => P(u, v))]);
    for (const hd of face.holes ?? []) {
      if (hd.type === 'circle') circles.push({ c: P(hd.u, hd.v), d: hd.d, note: hd.note });
      else cuts.push([holeRing(hd).map(([u, v]) => P(u, v))]);
    }
    for (const fl of face.flanges ?? []) {
      const [p0, p1] = edgeSegment(face, fl);
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      fl.w = L;
      fl.h = fl.len;
      const ang = fl.angle ?? 90;
      const cbd = bendDeduction(t, r, ang);
      const a = P(p0[0], p0[1]),
        b = P(p1[0], p1[1]);
      const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const Tc = { c: Math.cos(th), s: Math.sin(th), x: a[0], y: a[1] };
      const lineP = (u) => [Tc.x + Tc.c * u + Tc.s * (cbd / 2), Tc.y + Tc.s * u - Tc.c * (cbd / 2)];
      bends.push({ p0: lineP(0), p1: lineP(L), angle: ang, dir: fl.dir ?? 'up', len: L, r });
      rec(fl, Tc, cbd);
    }
  };
  rec(part, { c: 1, s: 0, x: 0, y: 0 }, 0);

  let poly = polygonClipping.union(...faces);
  if (cuts.length) poly = polygonClipping.difference(poly, ...cuts);

  // normaliza: origem no canto inferior esquerdo da caixa envolvente
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const pg of poly)
    for (const ring of pg)
      for (const [x, y] of ring) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const sh = ([x, y]) => [x - x0, y - y0];
  const outer = [],
    inner = [];
  for (const pg of poly) {
    pg.forEach((ring, i) => (i === 0 ? outer : inner).push(cleanRing(ring).map(sh)));
  }
  const circ = circles.map((c) => ({ ...c, c: sh(c.c) }));
  const bnd = bends.map((b) => ({ ...b, p0: sh(b.p0), p1: sh(b.p1) }));

  let area = 0,
    cutLength = 0;
  for (const rg of outer) {
    area += Math.abs(ringArea(rg));
    cutLength += ringLength(rg);
  }
  for (const rg of inner) {
    area -= Math.abs(ringArea(rg));
    cutLength += ringLength(rg);
  }
  for (const c of circ) {
    area -= (Math.PI * c.d * c.d) / 4;
    cutLength += Math.PI * c.d;
  }
  return {
    outer,
    inner,
    circles: circ,
    bends: bnd,
    origin: [x0, y0], // canto da caixa envolvente, no referencial da face base
    width: x1 - x0,
    height: y1 - y0,
    area,
    cutLength,
    pierces: outer.length + inner.length + circ.length,
    mass: area * t * (part.density ?? STEEL_DENSITY),
  };
}

// Sequência de dobras para a dobradeira: por borda da base, primeiro a dobra mais distante (aba da aba),
// depois a da raiz. Cada passo traz o caminho de índices até a aba e a linha de dobra no plano da base.
export function bendSequence(part) {
  const steps = [];
  (part.flanges ?? []).forEach((fl, i) => {
    const [p0, p1] = edgeSegment(part, fl);
    const dx = p1[0] - p0[0],
      dy = p1[1] - p0[1];
    const L = Math.hypot(dx, dy);
    const out = [-dy / L, dx / L]; // normal para fora (u' girado 90° anti-horário)
    const chain = [];
    const rec = (f, path, off) => {
      chain.push({ path, off, angle: f.angle ?? 90, dir: f.dir ?? 'up', len: f.len });
      (f.flanges ?? []).forEach((c, j) => {
        if ((c.edge ?? 'top') === 'top') rec(c, [...path, j], off + f.len);
      });
    };
    rec(fl, [i], 0);
    chain.reverse().forEach((c) =>
      steps.push({ ...c, mid: [(p0[0] + p1[0]) / 2 + out[0] * c.off, (p0[1] + p1[1]) / 2 + out[1] * c.off], out, along: [dx / L, dy / L], L })
    );
  });
  return steps;
}

// Resumo de furos para a tabela do desenho: [{ d, n }]
export function holeTable(part) {
  const map = new Map();
  walkFaces(part, ({ face }) => {
    for (const hd of face.holes ?? []) {
      const key = hd.type === 'circle' ? `Ø${fmt(hd.d)}` : hd.type === 'slot' ? `oblongo ${fmt(hd.d)} × ${fmt(hd.len)}` : hd.type === 'rect' ? `recorte ${fmt(hd.w)} × ${fmt(hd.h)}` : 'recorte';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  });
  return [...map].map(([label, n]) => ({ label, n }));
}

export function bendCount(part) {
  let n = 0;
  walkFaces(part, ({ bend }) => bend && n++);
  return n;
}

export const fmt = (v, d = 1) => {
  const s = Number(v).toFixed(d);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
};
