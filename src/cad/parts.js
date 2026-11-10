// Peças de chapa do Locker Residencial LR-1020, prontas para fabricação (corte a laser → dobra → solda).
// Tudo sai do SPEC do modelo 3D. Coordenadas do armário: X largura, Y altura, Z profundidade (+Z = frente).
//
// Cada peça: face base + abas (ver sheetmetal.js) e `inst`, a lista de posições no conjunto:
//   { o: origem da face, u, v: direções dos eixos da face, frame: { o, rx, ry } referencial pai (porta, bandeja…) }
// O material fica do lado +n = u × v, a partir do plano da origem.

import { SPEC } from '../locker/spec.js';

const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const neg = (a) => a.map((v) => -v);
const DEG = Math.PI / 180;

export const MATERIALS = {
  crs20: { label: 'Aço carbono SAE 1008 laminado a frio', t: 2.0, gauge: '#14' },
  crs15: { label: 'Aço carbono SAE 1008 laminado a frio', t: 1.5, gauge: '#16' },
  gi20: { label: 'Aço galvanizado Z275', t: 2.0, gauge: '#14' },
  gi30: { label: 'Aço galvanizado Z275', t: 3.0, gauge: '#11' },
};

export const GROUPS = {
  carcaca: { label: 'Carcaça soldada', finish: 'Pintura eletrostática RAL 7016', color: 'body' },
  base: { label: 'Base', finish: 'Pintura eletrostática RAL 7021', color: 'cap' },
  tampo: { label: 'Tampo', finish: 'Pintura eletrostática RAL 7021', color: 'cap' },
  porta: { label: 'Portas', finish: 'Pintura eletrostática RAL 7016', color: 'front' },
  basculante: { label: 'Basculante', finish: 'Pintura eletrostática RAL 7016', color: 'front' },
  mecanismo: { label: 'Mecanismo', finish: 'Galvanizado (sem pintura)', color: 'mech' },
};

export const MODELS = {
  cylinder: { code: 'A1', label: 'Armário 1 · chave', lock: 'cylinder', hopperLock: false },
  solenoid: { code: 'A2', label: 'Armário 2 · solenoide', lock: 'solenoid', hopperLock: false },
  drawer: { code: 'A3', label: 'Armário 3 · solenoide + gaveta', lock: 'solenoid', hopperLock: true },
};

const circle = (u, v, d, note) => ({ type: 'circle', u, v, d, note });
const rect = (u, v, w, h) => ({ type: 'rect', u, v, w, h });

// Ângulo `a` tal que |A − (O + R(a)·w)| = L (raiz mais próxima de `guess`). Pontos em [z, y].
function solveAngle(A, O, w, L, guess) {
  const d = [A[0] - O[0], A[1] - O[1]];
  const dl = Math.hypot(...d),
    wl = Math.hypot(...w);
  const cs = Math.max(-1, Math.min(1, (dl * dl + wl * wl - L * L) / (2 * dl * wl)));
  const base = Math.atan2(d[1], d[0]) - Math.atan2(w[1], w[0]);
  const off = Math.acos(cs);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const c1 = wrap(base + off),
    c2 = wrap(base - off);
  return Math.abs(wrap(c1 - guess)) <= Math.abs(wrap(c2 - guess)) ? c1 : c2;
}
const rot2 = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];

// Cinemática do mecanismo com o basculante fechado (posição de montagem)
export function mechanismPose() {
  const { D, hopper: hp, tray: tr, flap: fl } = SPEC;
  const hz = D / 2;
  const p0 = [hz - hp.pivot.u, hp.cornerY + hp.pivot.y]; // dobradiça do basculante [z, y]
  const doorPin = (th) => [p0[0] + hp.pin.dy * Math.sin(th) + hp.pin.z * Math.cos(th), p0[1] + hp.pin.dy * Math.cos(th) - hp.pin.z * Math.sin(th)];
  const P = [tr.pivot.z, tr.pivot.y];
  const open = doorPin(Math.PI / 2);
  const arm1 = Math.hypot(open[0] - (P[0] + tr.pin[0]), open[1] - (P[1] + tr.pin[1]));
  const arm2 = Math.hypot(P[0] + fl.pin[0] - (fl.z + fl.g), P[1] + fl.pin[1] - fl.y);
  const phi = tr.closeAngle * DEG; // bandeja girada 90° com a porta fechada
  const Dp = doorPin(0);
  const q = rot2(tr.pin, phi);
  const Q = [P[0] + q[0], P[1] + q[1]];
  const rr = rot2(fl.pin, phi);
  const R = [P[0] + rr[0], P[1] + rr[1]];
  const Hf = [fl.z, fl.y];
  const a2 = solveAngle(R, Hf, [fl.g, 0], arm2, -0.53 * phi);
  const g = rot2([fl.g, 0], a2);
  const G = [Hf[0] + g[0], Hf[1] + g[1]];
  return { arm1, arm2, phi, psi: -a2, D: Dp, Q, R, G, P, hinge: p0 };
}

export function buildParts(modelKey = 'drawer') {
  const model = MODELS[modelKey];
  const sol = model.lock === 'solenoid';
  const { W, D, H, cap, stile, door, backDoor, lowerRail: lr, upperRail: ur, elec: el, hopper: hp, tray: tr, flap: fl, arm } = SPEC;
  const t = SPEC.sheet; // 2,0 mm
  const hx = W / 2,
    hz = D / 2;
  const yb = cap.h,
    yt = H - cap.h;
  const fx = hx - t - stile.w; // 187: borda interna dos montantes
  const sw = stile.w + t; // 18: medida externa do montante e do retorno
  const pose = mechanismPose();
  const parts = [];
  const add = (p) => (parts.push(p), p);

  // ---------- Base e tampo (bandeja invertida: chapa + 4 abas de 20 mm para baixo) ----------
  const capW = W + cap.overhang * 2,
    capD = D + cap.overhang * 2;
  const capFlanges = () => [
    { edge: 'top', len: cap.h, dir: 'down' },
    { edge: 'bottom', len: cap.h, dir: 'down' },
    { edge: 'left', len: cap.h, dir: 'down', i0: t, i1: t },
    { edge: 'right', len: cap.h, dir: 'down', i0: t, i1: t },
  ];
  // furos de fixação nas abas das laterais (parafuso M6 em rebite rosca)
  const fixHoles = [-100, 100].flatMap((z) => [-1, 1].map((s) => circle(capW / 2 + s * (hx - 10), capD / 2 - z, 7, 'M6')));
  add({
    id: 'LR-001',
    name: 'Base',
    group: 'base',
    mat: 'crs20',
    w: capW,
    h: capD,
    holes: [...fixHoles, ...[[40, 40], [capW - 40, 40], [40, capD - 40], [capW - 40, capD - 40]].map(([u, v]) => circle(u, v, 12, 'chumbador M10'))],
    flanges: capFlanges(),
    weld: 'Fechar os 4 cantos com solda MIG e lixar.',
    inst: [{ o: [-capW / 2, cap.h - t, capD / 2], u: X, v: neg(Z) }],
  });
  add({
    id: 'LR-002',
    name: 'Tampo',
    group: 'tampo',
    mat: 'crs20',
    w: capW,
    h: capD,
    holes: fixHoles,
    flanges: capFlanges(),
    weld: 'Fechar os 4 cantos com solda MIG e lixar (face de cima sem marcas).',
    inst: [{ o: [-capW / 2, H - t, capD / 2], u: X, v: neg(Z) }],
  });

  // ---------- Laterais (painel + montante dobrado na frente e atrás, com retorno) ----------
  // Montante: aba de 18 mm + retorno de 18 mm. Abas de 20 mm em cima e embaixo recebem base e tampo.
  // Modelos com solenoide: janela de 32 mm no montante por onde passa a lingueta da porta (frente = lateral
  // esquerda; trás = lateral direita). O corpo preto do solenoide é parafusado no painel (2 × Ø4,5).
  const sideH = yt - yb; // 980
  const winV = (yLock) => yLock - yb - 16; // início da janela, medido da borda de baixo
  const vFront = door.y0 + door.lock.y,
    vBack = backDoor.y0 + backDoor.lockY;
  const stileFlange = (edge, win) => {
    // win: altura (v) da janela ou null. Na aba 'right' o eixo u' corre de cima para baixo.
    const uw = win == null ? null : edge === 'right' ? sideH - win - 32 : win;
    const cut = uw == null ? [] : [rect(uw, 0, 32, sw)];
    return { edge, len: sw, dir: 'up', holes: cut, flanges: [{ edge: 'top', len: sw, dir: 'up', holes: cut.map((c) => ({ ...c })) }] };
  };
  const capFlange = (edge, us) => ({ edge, len: 20, dir: 'up', i0: 20, i1: 20, holes: us.map((u) => circle(u, 10, 9, 'rebite rosca M6')) });
  const solHoles = (yLock) => [circle(hz - 112, yLock + 12 - yb, 4.5, 'solenoide'), circle(hz - 146, yLock - 14 - yb, 4.5, 'solenoide')];
  const pivotHole = (u) => circle(u, tr.pivot.y - yb, 7, 'eixo da bandeja M6');
  add({
    id: 'LR-010',
    name: 'Lateral direita',
    variant: sol ? 'SOL' : 'CHV',
    group: 'carcaca',
    mat: 'crs20',
    w: D,
    h: sideH,
    // u = +Z (fundo → frente), v = +Y
    holes: [pivotHole(tr.pivot.z + hz), ...(sol ? solHoles(vBack) : [])],
    flanges: [
      stileFlange('right', null), // frente
      stileFlange('left', sol ? winV(vBack) : null), // trás (porta traseira trava deste lado)
      capFlange('top', [70, 270]),
      capFlange('bottom', [70, 270]),
    ],
    weld: 'Solda ponto nas abas de 20 mm (base/tampo aparafusados).',
    inst: [{ o: [hx, yb, -hz], u: Z, v: Y }],
  });
  add({
    id: 'LR-011',
    name: 'Lateral esquerda',
    variant: sol ? 'SOL' : 'CHV',
    group: 'carcaca',
    mat: 'crs20',
    w: D,
    h: sideH,
    // u = −Z (frente → fundo), v = +Y
    holes: [pivotHole(hz - tr.pivot.z), ...(sol ? solHoles(vFront) : [])],
    flanges: [
      stileFlange('left', sol ? winV(vFront) : null), // frente (porta frontal trava deste lado)
      stileFlange('right', null), // trás
      capFlange('top', [70, 270]),
      capFlange('bottom', [70, 270]),
    ],
    weld: 'Solda ponto nas abas de 20 mm (base/tampo aparafusados).',
    inst: [{ o: [-hx, yb, hz], u: neg(Z), v: Y }],
  });

  // ---------- Fundo (entre a porta traseira e a tampa da eletrônica) ----------
  const backY0 = backDoor.y0 + backDoor.h + 3,
    backY1 = el.rear.y0 - 3;
  const boxFlanges = (top, bottom, side) => [
    { edge: 'top', len: top, dir: 'up', i0: t, i1: t },
    { edge: 'bottom', len: bottom, dir: 'up', i0: t, i1: t },
    { edge: 'left', len: side, dir: 'up' },
    { edge: 'right', len: side, dir: 'up' },
  ];
  add({
    id: 'LR-020',
    name: 'Fundo',
    group: 'carcaca',
    mat: 'crs20',
    w: fx * 2,
    h: backY1 - backY0,
    flanges: boxFlanges(sw, sw, sw),
    weld: 'Abas laterais soldadas (ponto) nos retornos traseiros das laterais.',
    inst: [{ o: [-fx, backY0, -hz], u: X, v: Y }],
  });

  // ---------- Travessa inferior (frente, entre a porta de baixo e o basculante) ----------
  add({
    id: 'LR-021',
    name: 'Travessa inferior',
    group: 'carcaca',
    mat: 'crs20',
    w: fx * 2,
    h: lr.y1 - lr.y0,
    flanges: boxFlanges(10, 22, sw),
    weld: 'Abas laterais soldadas nos retornos dos montantes. A aba de baixo é o batente da porta (recebe a vedação).',
    inst: [{ o: [fx, lr.y0, hz - t], u: neg(X), v: Y }],
  });

  // ---------- Painel superior (frente do módulo eletrônico + batente de cima da boca) ----------
  add({
    id: 'LR-022',
    name: 'Painel superior',
    group: 'carcaca',
    mat: 'crs20',
    w: fx * 2,
    h: yt - ur.y0,
    flanges: boxFlanges(sw, 30, sw),
    weld: 'Abas laterais soldadas nos retornos dos montantes. A aba de baixo (30 mm) é o teto da boca.',
    inst: [{ o: [fx, ur.y0, hz], u: neg(X), v: Y }],
  });

  // ---------- Rampa (piso do módulo eletrônico = teto da boca) ----------
  const rampL = Math.hypot(ur.y1 - el.rear.y0, el.ceil.z1 - el.ceil.z0);
  const rv = [0, (el.rear.y0 - ur.y1) / rampL, (el.ceil.z0 - el.ceil.z1) / rampL];
  const rn = [0, -rv[2], rv[1]]; // X × v
  const rampW = 2 * (hx - t - 1);
  const pcbV = (cz) => ((el.ceil.z1 - cz) * rampL) / (el.ceil.z1 - el.ceil.z0);
  add({
    id: 'LR-023',
    name: 'Rampa do módulo eletrônico',
    group: 'carcaca',
    mat: 'crs20',
    w: rampW,
    h: rampL,
    holes: [
      ...[-140, 140].flatMap((x) => [24, 164].map((cz) => circle(rampW / 2 + x, pcbV(cz), 4, 'espaçador M3'))),
      circle(rampW / 2, rampL - 40, 25, 'passa-cabo'),
    ],
    flanges: [
      { edge: 'left', len: 15, dir: 'down', i0: 10, i1: 10 },
      { edge: 'right', len: 15, dir: 'down', i0: 10, i1: 10 },
    ],
    weld: 'Abas laterais soldadas (ponto) nas laterais, da frente (50 mm abaixo do tampo) ao fundo (100 mm).',
    inst: [{ o: [-rampW / 2, ur.y1 - rn[1], el.ceil.z1 - rn[2]], u: X, v: rv }],
  });

  // ---------- Batente traseiro da bandeja ----------
  add({
    id: 'LR-024',
    name: 'Batente traseiro da bandeja',
    group: 'carcaca',
    mat: 'crs20',
    w: 2 * (hx - t),
    h: tr.rearStop,
    flanges: [{ edge: 'top', len: 16, dir: 'down' }],
    weld: 'Aba soldada na face interna do fundo.',
    inst: [{ o: [-(hx - t), tr.topY + 1, -hz + t + tr.rearStop], u: X, v: neg(Z) }],
  });

  // ---------- Portas (frente e trás: a mesma peça) e tampa da eletrônica ----------
  const lip = 14;
  const doorFlange = (edge, inset, holes = [], lipHoles = []) => ({
    edge,
    len: door.depth,
    dir: 'up',
    i0: inset,
    i1: inset,
    holes,
    flanges: [{ edge: 'top', len: lip, dir: 'up', i0: lip, i1: lip, holes: lipHoles }],
  });
  const doorPart = (id, name, h, lockY, keyLock, instances) =>
    add({
      id,
      name,
      variant: keyLock ? 'CHV' : 'SOL',
      group: 'porta',
      mat: 'crs20',
      w: door.w,
      h,
      // u = −X (dobradiça → fechadura), v = +Y; face de fora em z = 0
      holes: keyLock ? [circle(-door.lock.x, lockY, 19, 'fechadura de tambor')] : [],
      flanges: [
        doorFlange('left', 0, h > 200 ? [50, 80, h - 80, h - 50].map((v) => circle(v, 10, 5, 'dobradiça')) : [30, h - 30].map((v) => circle(v, 10, 5, 'dobradiça'))),
        // lado da fechadura: nos modelos com solenoide a lingueta é parafusada na aba de fechamento
        doorFlange('right', 0, [], keyLock ? [] : [7, -7].map((d) => circle(h - lockY + d - lip, lip / 2, 4.2, 'lingueta'))),
        doorFlange('top', t),
        doorFlange('bottom', t),
      ],
      weld: 'Fechar os 4 cantos com solda MIG e lixar. As ripas são soldadas por bujão na face de fora.',
      inst: instances,
    });
  const frontFrame = { o: [door.pivotX, door.y0, hz], ry: 0 };
  const backFrame = { o: [-door.pivotX, backDoor.y0, -hz], ry: 180 };
  const elecFrame = { o: [-door.pivotX, el.rear.y0, -hz], ry: 180 };
  const doorInst = (frame) => ({ o: [0, 0, 0], u: neg(X), v: Y, frame });
  doorPart('LR-030', 'Porta (frente e trás)', door.h, door.lock.y, !sol, [doorInst(frontFrame), doorInst(backFrame)]);
  doorPart('LR-031', 'Tampa do módulo eletrônico', el.y1 - el.rear.y0, (el.y1 - el.rear.y0) / 2, true, [doorInst(elecFrame)]);

  // ---------- Ripas (perfil "weatherboard": face + aba de 6 mm que afasta a borda de baixo) ----------
  const slatT = MATERIALS.crs15.t;
  const slatRise = 6 - slatT; // quanto a borda de baixo fica afastada da chapa de trás
  const slat = (id, name, group, width, y0, y1, origin, frames) => {
    const n = Math.max(1, Math.round((y1 - y0) / door.slatH));
    const pitch = (y1 - y0) / n;
    const h = pitch - 2.4;
    const a = Math.asin(slatRise / h);
    const inst = [];
    for (const frame of frames)
      for (let i = 0; i < n; i++) {
        inst.push({ o: [origin[0], origin[1] + y0 + pitch * i + 1.2, origin[2] + slatRise], u: X, v: [0, Math.cos(a), -Math.sin(a)], frame });
      }
    return add({
      id,
      name,
      group,
      mat: 'crs15',
      w: width,
      h,
      flanges: [{ edge: 'bottom', len: 6, dir: 'down' }],
      weld: 'Solda por bujão (2 pontos) + adesivo estrutural na chapa de trás, de baixo para cima.',
      inst,
    });
  };
  slat('LR-040', 'Ripa da porta', 'porta', door.w, 0, door.h, [-door.w, 0, 0], [frontFrame, backFrame]);
  slat('LR-041', 'Ripa da travessa', 'carcaca', fx * 2, 0, lr.y1 - lr.y0, [-fx, lr.y0, hz - t], [null]);

  // ---------- Basculante (porta de depósito) ----------
  const hopFrame = { o: [0, hp.cornerY, hz] };
  const band = 62; // faixa lisa com a gravação "Encomendas"
  add({
    id: 'LR-050',
    name: 'Porta do basculante',
    group: 'basculante',
    mat: 'crs20',
    w: hp.faceW,
    h: hp.faceH,
    flanges: [
      // puxador: dobra para a frente e desce (U invertido)
      { edge: 'top', len: 14, dir: 'down', flanges: [{ edge: 'top', len: 12, dir: 'down' }] },
      { edge: 'bottom', len: 14, dir: 'up', i0: t, i1: t },
      { edge: 'left', len: 14, dir: 'up', i0: 0, i1: 16 },
      { edge: 'right', len: 14, dir: 'up', i0: 16, i1: 0 },
    ],
    weld: 'Soldar os pinos Ø7 das bielas nas abas laterais (a 75 mm da dobradiça) e as ripas na face.',
    inst: [{ o: [hp.faceW / 2, 0, 0], u: neg(X), v: Y, frame: hopFrame }],
  });
  slat('LR-042', 'Ripa do basculante', 'basculante', hp.faceW, 0, hp.faceH - band, [-hp.faceW / 2, 0, 0], [hopFrame]);

  // ---------- Bandeja giratória: piso + 2 placas ----------
  const trayFrame = { o: [0, tr.pivot.y, tr.pivot.z], rx: -pose.phi / DEG };
  add({
    id: 'LR-060',
    name: 'Piso da bandeja',
    group: 'mecanismo',
    mat: 'gi20',
    w: tr.halfW * 2,
    h: tr.length,
    flanges: [
      { edge: 'left', len: 15, dir: 'up' },
      { edge: 'right', len: 15, dir: 'up' },
    ],
    weld: 'Abas laterais soldadas (ponto) na face interna das placas.',
    inst: [{ o: [-tr.halfW, tr.floorY - t, tr.front], u: X, v: neg(Z), frame: trayFrame }],
  });
  add({
    id: 'LR-061',
    name: 'Placa lateral da bandeja',
    group: 'mecanismo',
    mat: 'gi20',
    outline: tr.plate.map(([z, y]) => [-z, y]),
    holes: [circle(0, 0, 7, 'eixo M6'), circle(-tr.pin[0], tr.pin[1], 7, 'pino da biela 1'), circle(-fl.pin[0], fl.pin[1], 7, 'pino da biela 2')],
    weld: 'Plana, sem dobras. Soldar os pinos Ø7 das bielas.',
    inst: [-1, 1].map((s) => ({ o: [s < 0 ? -tr.cheek.x - t : tr.cheek.x, 0, 0], u: neg(Z), v: Y, frame: trayFrame })),
  });

  // ---------- Aba superior (viseira) ----------
  add({
    id: 'LR-062',
    name: 'Aba superior (viseira)',
    group: 'mecanismo',
    mat: 'gi20',
    w: 336,
    h: fl.len,
    flanges: [
      { edge: 'left', len: 12, dir: 'up', holes: [circle(fl.g, 7, 6, 'pino da biela 2')] },
      { edge: 'right', len: 12, dir: 'up', holes: [circle(fl.len - fl.g, 7, 6, 'pino da biela 2')] },
    ],
    weld: 'Soldar o tubo da dobradiça Ø7 na borda do eixo.',
    inst: [{ o: [-168, 0, 0], u: X, v: Z, frame: { o: [0, fl.y, fl.z], rx: pose.psi / DEG } }],
  });

  // ---------- Bielas (barras chatas com 2 furos) ----------
  // Largura de fabricação: 16 mm (furo Ø7 com 4,5 mm de parede); o modelo 3D mostra a biela mais fina.
  const linkW = Math.max(arm.w, 16),
    linkOver = Math.max(arm.over, 9);
  const link = (id, name, len, from, to, xs) => {
    const d = [to[0] - from[0], to[1] - from[1]];
    const l = Math.hypot(...d);
    const v = [0, d[1] / l, d[0] / l]; // ao longo da biela
    const u = [0, v[2], -v[1]]; // v × X
    return add({
      id,
      name,
      group: 'mecanismo',
      mat: 'gi30',
      w: linkW,
      h: len + linkOver * 2,
      holes: [circle(linkW / 2, linkOver, 7, 'pino'), circle(linkW / 2, linkOver + len, 7, 'pino')],
      weld: 'Plana, sem dobras. Rebarbar os furos.',
      inst: xs.map((x) => ({
        o: [x - arm.t / 2, from[1] - v[1] * linkOver - u[1] * (linkW / 2), from[0] - v[2] * linkOver - u[2] * (linkW / 2)],
        u,
        v,
      })),
    });
  };
  link('LR-063', 'Biela da porta', pose.arm1, pose.D, pose.Q, [-arm.x1, arm.x1]);
  link('LR-064', 'Biela da aba', pose.arm2, pose.R, pose.G, [-arm.x2, arm.x2]);

  for (const p of parts) {
    p.t = MATERIALS[p.mat].t;
    p.r = p.t;
    p.qty = p.inst.length;
    p.model = model.code;
    p.file = `${p.id}${p.variant ? '-' + p.variant : ''}`;
  }
  return parts;
}

// Itens comprados (não são de chapa): entram na lista de materiais.
export function purchasedItems(modelKey = 'drawer') {
  const m = MODELS[modelKey];
  const sol = m.lock === 'solenoid';
  const nSol = sol ? 2 + (m.hopperLock ? 1 : 0) : 0;
  return [
    ...(nSol ? [{ item: 'Fechadura solenoide de smartlocker 12 V (corpo + lingueta em U)', qty: nSol }] : []),
    { item: 'Fechadura de tambor Ø19 com came e 2 chaves', qty: sol ? 1 : 3 },
    { item: 'Dobradiça de pino para porta (aço zincado)', qty: 6 },
    { item: 'Eixo da dobradiça do basculante, aço Ø9 × 372 mm', qty: 1 },
    { item: 'Pino de biela Ø7 × 10 mm (soldar)', qty: 8 },
    { item: 'Parafuso M6 × 30 com bucha quadrada (eixo da bandeja)', qty: 2 },
    { item: 'Rebite rosca M6 (abas das laterais)', qty: 8 },
    { item: 'Parafuso M6 × 12 cabeça abaulada (base e tampo)', qty: 8 },
    { item: 'Batente de borracha Ø12', qty: 3 },
    { item: 'Perfil de vedação de borracha 8 × 3 mm', qty: '0,4 m' },
    { item: 'Placa controladora + fonte 12 V', qty: sol ? 1 : 0 },
    { item: 'Chumbador M10 para piso', qty: 4 },
  ].filter((i) => i.qty !== 0);
}
