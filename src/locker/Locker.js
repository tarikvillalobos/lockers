import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPEC, DEG } from './spec.js';
import { createTextDecal } from './textures.js';
import { tween, ease } from '../core/tween.js';
import { sfx } from '../core/sound.js';

// ---------- helpers de geometria (mm) ----------
function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Caixa definida por intervalos [x0,x1] [y0,y1] [z0,z1]
function box(mat, x0, x1, y0, y1, z0, z1) {
  const m = mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

function cylX(mat, r, x0, x1, y, z, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg);
  g.rotateZ(Math.PI / 2);
  const m = mesh(g, mat);
  m.position.set((x0 + x1) / 2, y, z);
  return m;
}

function cylZ(mat, r, z0, z1, x, y, seg = 32) {
  const g = new THREE.CylinderGeometry(r, r, z1 - z0, seg);
  g.rotateX(Math.PI / 2);
  const m = mesh(g, mat);
  m.position.set(x, y, (z0 + z1) / 2);
  return m;
}

// Tira de chapa entre dois pontos no plano YZ (largura em X)
function strip(mat, width, thick, from, to) {
  const dy = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dy, dz);
  const m = mesh(new THREE.BoxGeometry(width, thick, len), mat);
  m.position.set(0, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  m.rotation.x = Math.atan2(-dy, dz);
  return m;
}

// Ripas horizontais (estilo "weatherboard"): cada ripa levemente inclinada, a borda de
// baixo saliente, para a luz marcar as linhas como na frente do Hamilton.
const seamMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
function addSlats(group, mat, x0, x1, y0, y1, zFace, pitch) {
  const n = Math.max(1, Math.round((y1 - y0) / pitch));
  const h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const m = mesh(new THREE.BoxGeometry(x1 - x0, h - 2.4, 3), mat);
    m.position.set((x0 + x1) / 2, y0 + h * i + h / 2, zFace + 2);
    m.rotation.x = -3 * DEG;
    group.add(m);
    if (i > 0) {
      // sombra da junta entre ripas
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 3.2), seamMat);
      seam.position.set((x0 + x1) / 2, y0 + h * i, zFace + 0.6);
      seam.userData.noEdges = true;
      group.add(seam);
    }
  }
}

// Ângulo `a` tal que a distância de A ao ponto O + R(a)·w vale L (raiz mais próxima de `guess`)
function solveAngle(A, O, w, L, guess) {
  const d = A.clone().sub(O);
  const dl = d.length(),
    wl = w.length();
  const cs = THREE.MathUtils.clamp((dl * dl + wl * wl - L * L) / (2 * dl * wl), -1, 1);
  const base = Math.atan2(d.y, d.x) - Math.atan2(w.y, w.x);
  const off = Math.acos(cs);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const c1 = wrap(base + off),
    c2 = wrap(base - off);
  return Math.abs(wrap(c1 - guess)) <= Math.abs(wrap(c2 - guess)) ? c1 : c2;
}

function approach(cur, target, dt, rate = 7, minSpeed = 30) {
  const diff = target - cur;
  if (Math.abs(diff) < 0.02) return target;
  const step = Math.max(Math.abs(diff) * rate, minSpeed) * dt;
  return Math.abs(diff) <= step ? target : cur + Math.sign(diff) * step;
}

// ---------- Locker ----------
export class Locker {
  constructor(materials) {
    this.m = materials;
    this.root = new THREE.Group();
    this.root.name = 'Locker';
    this.root.scale.setScalar(0.001); // modelado em mm, cena em metros

    this.parts = {}; // grupos para vista explodida
    this.explodeOffsets = {};
    this.decals = [];

    this.hopper = { angle: 0, target: 0 };
    this.doors = {}; // front / back: { angle, target, shake, locked, busy, ... }
    this.explode = { v: 0, target: 0 };

    this._buildBody();
    this._buildFrontFrame();
    this._buildDoor('front', 0);
    this._buildDoor('back', Math.PI); // mesma porta, espelhada no fundo
    this._buildMechanism();
    this._applyExplode(0);
    this._updateMechanism();
  }

  // Texto gravado num plano (cor ajustada ao acabamento em main.js)
  _decal(group, text, w, h, x, y, z, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      map: createTextDecal(text, opts),
      transparent: true,
      opacity: 0.6,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    d.position.set(x, y, z);
    d.userData.noEdges = true;
    group.add(d);
    this.decals.push(mat);
    return d;
  }

  _part(name, offset) {
    const g = new THREE.Group();
    g.name = name;
    this.root.add(g);
    this.parts[name] = g;
    this.explodeOffsets[name] = new THREE.Vector3(...offset);
    return g;
  }

  _buildBody() {
    const { W, D, cap, stile, sheet } = SPEC;
    const hx = W / 2,
      hz = D / 2;
    const m = this.m;

    // Base e tampo (chapa dobrada, cantos levemente arredondados)
    const capW = W + cap.overhang * 2,
      capD = D + cap.overhang * 2;
    const base = this._part('base', [0, 0, 0]);
    const baseMesh = mesh(new RoundedBoxGeometry(capW, cap.h, capD, 3, cap.radius), m.cap);
    baseMesh.position.y = cap.h / 2;
    base.add(baseMesh);
    // chapa de fundo interna (galvanizada)
    const floor = box(m.galv, -hx + 4, hx - 4, cap.h, cap.h + sheet, -hz + 4, hz - 4);
    base.add(floor);

    const top = this._part('top', [0, 220, 0]);
    const topMesh = mesh(new RoundedBoxGeometry(capW, cap.h, capD, 3, cap.radius), m.cap);
    topMesh.position.y = SPEC.H - cap.h / 2;
    top.add(topMesh);

    const yb = cap.h,
      yt = SPEC.H - cap.h;
    const ix = hx - sheet; // face interna das laterais

    for (const side of [-1, 1]) {
      const g = this._part(side < 0 ? 'sideL' : 'sideR', [side * 260, 0, 0]);
      const panel = box(m.shell, side < 0 ? -hx : ix, side < 0 ? -ix : hx, yb, yt, -hz, hz);
      panel.userData.shell = true;
      g.add(panel);
      // montante frontal (dobra da lateral) + retorno interno
      const sx0 = side < 0 ? -ix : ix - stile.w;
      const sx1 = side < 0 ? -ix + stile.w : ix;
      g.add(box(m.body, sx0, sx1, yb, yt, hz - sheet, hz));
      const rx0 = side < 0 ? -ix + stile.w - sheet : ix - stile.w;
      g.add(box(m.body, rx0, rx0 + sheet, yb, yt, hz - sheet - stile.ret, hz - sheet));
      // dobra traseira (vira o montante da porta traseira)
      g.add(box(m.body, side < 0 ? -ix : ix - stile.w, side < 0 ? -ix + stile.w : ix, yb, yt, -hz, -hz + sheet));
      if (side > 0) this.sidePanelR = panel;
      else this.sidePanelL = panel;
    }

    // Fundo: faixa acima da porta traseira + retornos (batente da came)
    const back = this._part('back', [0, 0, -260]);
    const bd = SPEC.backDoor;
    const fx = ix - stile.w; // borda interna dos montantes (187)
    const topY = bd.y0 + bd.h + 3;
    const backStrip = box(m.shell, -ix, ix, topY, yt, -hz + sheet, -hz + sheet * 2);
    backStrip.userData.shell = true;
    back.add(backStrip);
    back.add(box(m.body, -fx, fx, topY, yt, -hz, -hz + sheet));
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -fx - sheet : fx;
      back.add(box(m.body, x0, x0 + sheet, yb, topY, -hz + sheet, -hz + sheet + stile.ret));
    }
  }

  _buildFrontFrame() {
    const { W, D, sheet, stile, lowerRail: lr, upperRail: ur, niche, lettersPanel: lp, door } = SPEC;
    const hz = D / 2;
    const fx = W / 2 - sheet - stile.w; // borda interna dos montantes (187)
    const m = this.m;
    const g = this._part('frame', [0, 0, 230]);

    // Painel "Cartas" (abaixo da fenda de cartas)
    g.add(box(m.front, -fx, fx, lp.y0, lp.y1, hz - sheet, hz));
    g.add(box(m.front, -fx, fx, lp.y1 - sheet, lp.y1, hz - 40, hz - sheet)); // dobra = lábio da fenda
    this._decal(g, 'Cartas', 110, 28, fx - 70, (lp.y0 + lp.y1) / 2 + 4, hz + 0.3, { w: 512, h: 128, size: 76, align: 'right', weight: 400, spacing: 2 });

    // Rebaixo de pegada (nicho aberto): fundo, teto inclinado (calha das cartas) e laterais
    g.add(box(m.body, -fx, fx, ur.y1, niche.ceilBackY + 2, niche.backZ, niche.backZ + sheet)); // fundo
    g.add(strip(m.body, fx * 2, 2, [lp.y0 - 1, hz - sheet], [niche.ceilBackY, niche.backZ])); // teto/calha
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -fx : fx - sheet;
      g.add(box(m.body, x0, x0 + sheet, ur.y1, lp.y0, niche.backZ, hz - sheet));
    }

    // Travessa superior (piso do nicho) com 3 batentes pretos
    g.add(box(m.body, -fx, fx, ur.y0, ur.y1, hz - sheet, hz));
    g.add(box(m.body, -fx, fx, ur.y1 - sheet, ur.y1, niche.backZ, hz - sheet));
    g.add(box(m.body, -fx, fx, ur.y0, ur.y0 + sheet, hz - 30, hz - sheet));
    const bumperGeo = new THREE.SphereGeometry(6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    bumperGeo.rotateX(Math.PI / 2);
    for (const x of [-150, 0, 150]) {
      const b = mesh(bumperGeo, m.rubber);
      b.position.set(x, (ur.y0 + ur.y1) / 2, hz);
      g.add(b);
    }

    // Travessa inferior (ripada, continua a frente)
    g.add(box(m.body, -fx, fx, lr.y0, lr.y1, hz - sheet - 2, hz - sheet));
    addSlats(g, m.front, -fx, fx, lr.y0, lr.y1, hz - sheet, door.slatH);
    g.add(box(m.body, -fx, fx, lr.y1 - sheet, lr.y1, hz - 10, hz - sheet));
    g.add(box(m.body, -fx, fx, lr.y0, lr.y0 + sheet, hz - 24, hz - sheet));

    // Vedação de borracha no batente da porta inferior
    g.add(box(m.rubber, -fx + 2, fx - 2, lr.y0 - 3, lr.y0, hz - 14, hz - 6));
  }

  // Porta com fechadura. which = 'front' | 'back'; a traseira é a frontal girada 180° em Y,
  // então a dobradiça fica à direita e a fechadura à esquerda de quem olha por trás.
  _buildDoor(which, rotY) {
    const { D, door, backDoor } = SPEC;
    const m = this.m;
    const hz = D / 2;
    const front = which === 'front';
    const y0 = front ? door.y0 : backDoor.y0;
    const part = this._part(front ? 'door' : 'doorBack', [0, 0, front ? 440 : -440]);
    part.rotation.y = rotY;
    const ds = { which, angle: 0, target: 0, shake: 0, locked: true, busy: false };
    this.doors[which] = ds;
    const pivot = new THREE.Group();
    pivot.position.set(door.pivotX, y0, hz);
    part.add(pivot);
    ds.pivot = pivot;

    const body = new THREE.Group();
    body.userData.action = 'door';
    body.userData.door = which;
    pivot.add(body);
    const w = door.w,
      h = front ? door.h : backDoor.h,
      d = door.depth;
    // face + retornos (chapa dobrada)
    body.add(box(m.front, -w, 0, 0, h, -2, 0));
    body.add(box(m.front, -w, -w + 2, 0, h, -d, -2));
    body.add(box(m.front, -2, 0, 0, h, -d, -2));
    body.add(box(m.front, -w + 2, -2, h - 2, h, -d, -2));
    body.add(box(m.front, -w + 2, -2, 0, 2, -d, -2));
    // reforços internos (perfis ômega)
    for (const cx of [-205, -163]) {
      body.add(box(m.front, cx - 11, cx + 11, 14, h - 14, -14, -2));
    }
    // frente ripada (as duas portas se confundem com a fachada)
    addSlats(body, m.front, -w, 0, 0, h, 0, door.slatH);
    // dobradiças internas
    for (const y of [60, h - 60]) {
      body.add(box(m.galv, -26, -2, y - 20, y + 20, -8, -2));
      body.add(cylX(m.galv, 4, -4, 4, y, -8, 16).rotateZ(Math.PI / 2));
    }

    // Fechadura tambor + came
    const L = door.lock;
    const lock = new THREE.Group();
    lock.position.set(L.x, front ? L.y : backDoor.lockY, 5);
    lock.userData.action = 'lock';
    lock.userData.door = which;
    body.add(lock);
    lock.add(cylZ(m.chrome, 12, 0, 3, 0, 0));
    lock.add(cylZ(m.chrome, 9.5, 3, 4.2, 0, 0));
    const slot = box(m.dark, -1.1, 1.1, -5, 5, 4.1, 4.5);
    slot.userData.noEdges = true;
    lock.add(slot);
    lock.add(cylZ(m.galv, 9, -24, -2, 0, 0, 20));

    const cam = new THREE.Group();
    cam.position.z = -31; // came atrás do retorno do montante
    cam.add(box(m.galv, -52, 6, -8, 8, -2, 2));
    lock.add(cam);
    ds.cam = cam;

    // Chave (só aparece ao destrancar)
    const key = new THREE.Group();
    const keyInner = new THREE.Group();
    key.add(keyInner);
    keyInner.add(box(m.brass, -1.2, 1.2, -4, 4, 2, 30));
    const bow = mesh(new THREE.CylinderGeometry(13, 13, 3, 28), m.brass);
    bow.rotation.z = Math.PI / 2;
    bow.position.z = 40;
    keyInner.add(bow);
    const ring = mesh(new THREE.TorusGeometry(4, 1.2, 8, 20), m.dark);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, 4, 44);
    keyInner.add(ring);
    key.visible = false;
    lock.add(key);
    ds.key = key;
    ds.keyInner = keyInner;
  }

  _buildMechanism() {
    const { D, hopper: hp, tray: tr, arm, flap: fl } = SPEC;
    const m = this.m;
    const hz = D / 2;
    const mech = this._part('mech', [0, 0, 0]);

    // ---- Porta de depósito (basculante): dobradiça embaixo, abre para fora ----
    const corner = new THREE.Vector2(hz, hp.cornerY); // (z, y)
    this.hopperPivotPos = new THREE.Vector2(corner.x - hp.pivot.u, corner.y + hp.pivot.y);
    const pivot = new THREE.Group();
    pivot.position.set(0, this.hopperPivotPos.y, this.hopperPivotPos.x);
    mech.add(pivot);
    this.hopperPivot = pivot;

    const body = new THREE.Group();
    body.position.set(0, -hp.pivot.y, hp.pivot.u);
    body.userData.action = 'hopper';
    pivot.add(body);
    this.hopperBody = body;

    const fw = hp.faceW / 2;
    body.add(box(m.front, -fw, fw, 0, hp.faceH, -2, 0)); // face
    body.add(strip(m.front, hp.faceW, 2, [hp.faceH, -1], [hp.faceH - 13, 12])); // puxador "PUXE"
    // faixa lisa com "Encomendas" no alto + ripas abaixo (como a fachada)
    const band = 62;
    addSlats(body, m.front, -fw, fw, 0, hp.faceH - band, 0, SPEC.door.slatH);
    this._decal(body, 'Encomendas', 150, 30, fw - 88, hp.faceH - band / 2 - 4, 0.4, { w: 640, h: 128, size: 76, align: 'right', weight: 400, spacing: 2 });
    // reforço interno da porta
    body.add(box(m.front, -fw + 10, fw - 10, 20, 34, -14, -2));

    // eixo da dobradiça + pinos onde a biela prende na porta
    pivot.add(cylX(m.chrome, 4.5, -186, 186, 0, 0, 16));
    for (const side of [-1, 1]) {
      const sx = (a, b) => (side < 0 ? [-b, -a] : [a, b]);
      pivot.add(cylX(m.chrome, 2, ...sx(183, 187), 0, 0, 10)); // pino da dobradiça até a face da coluna
      pivot.add(cylX(m.chrome, 3.5, ...sx(179, arm.x1 + arm.t / 2 + 1), hp.pin.dy, hp.pin.z, 12));
    }

    // ---- Bandeja giratória: 2 placas + piso, gira num eixo fixo no meio da boca ----
    const P = tr.pivot;
    const trayRot = new THREE.Group();
    trayRot.position.set(0, P.y, P.z);
    mech.add(trayRot);
    this.trayRot = trayRot;
    // referencial das encomendas: origem na borda da frente do piso, +y para cima, −z para o fundo
    const trayFrame = new THREE.Group();
    trayFrame.position.set(0, tr.floorY, tr.front);
    trayRot.add(trayFrame);
    this.tray = trayFrame;

    trayRot.add(box(m.mech, -tr.halfW, tr.halfW, tr.floorY - 2, tr.floorY, tr.back, tr.front)); // piso
    const plShape = new THREE.Shape();
    tr.plate.forEach(([z, y], i) => (i ? plShape.lineTo(-z, y) : plShape.moveTo(-z, y)));
    const plGeo = new THREE.ExtrudeGeometry(plShape, { depth: 2, bevelEnabled: false });
    plGeo.rotateY(Math.PI / 2); // (u = −z, v = y) → (z, y), extrusão em X
    for (const side of [-1, 1]) {
      const sx = (a, b) => (side < 0 ? [-b, -a] : [a, b]);
      const plate = mesh(plGeo, m.mech);
      plate.position.x = side < 0 ? -tr.cheek.x - 2 : tr.cheek.x;
      trayRot.add(plate);
      // pino da biela da porta e pino da biela da aba (ambos presos na placa)
      trayRot.add(cylX(m.chrome, 3.5, ...sx(tr.cheek.x, arm.x1 + arm.t / 2 + 1), tr.pin[1], tr.pin[0], 12));
      trayRot.add(cylX(m.chrome, 3.5, ...sx(arm.x2 - arm.t / 2 - 1, tr.cheek.x + 2), fl.pin[1], fl.pin[0], 12));
      // eixo fixo: parafuso atravessando a placa + bloco quadrado na parede
      mech.add(cylX(m.dark, 3.5, ...sx(176, 203), P.y, P.z, 12));
      mech.add(box(m.galv, ...sx(186, 203), P.y - 8, P.y + 8, P.z - 8, P.z + 8));
    }

    // soleira fixa entre a porta (dobradiça) e o piso da bandeja: nada cai pela fresta
    mech.add(box(m.mech, -tr.halfW, tr.halfW, tr.topY - 6, tr.topY - 2, P.z + tr.front, hz - 4));

    // batente fixo no fundo: cobre a ponta de trás do piso quando ele está horizontal
    const ix = SPEC.W / 2 - SPEC.sheet;
    this.parts.back.add(box(m.mech, -ix, ix, tr.topY + 1, tr.topY + 3, -hz + 4, -hz + 4 + tr.rearStop));

    // ---- Aba superior (viseira) + bielas chatas ----
    const flap = new THREE.Group();
    flap.position.set(0, fl.y, fl.z);
    mech.add(flap);
    flap.add(box(m.mech, -168, 168, -2, 0, 0, fl.len));
    flap.add(cylX(m.chrome, 3.5, -168, 168, -1, 0, 12));
    for (const side of [-1, 1]) {
      flap.add(cylX(m.chrome, 3, ...(side < 0 ? [-(arm.x2 + arm.t / 2 + 1), -168] : [168, arm.x2 + arm.t / 2 + 1]), -1, fl.g, 12));
    }
    this.topFlap = flap;
    for (const side of [-1, 1]) {
      // suportes da dobradiça da aba, presos na face de baixo da prateleira de cartas
      mech.add(box(m.galv, ...(side < 0 ? [-170, -168] : [168, 170]), fl.y - 2, SPEC.upperRail.y1, fl.z - 8, fl.z + 8));
    }

    // comprimentos das bielas (fixos): medidos com a porta aberta (90°), placa e aba em 0°
    const pivotV = new THREE.Vector2(P.z, P.y);
    this.arm1Len = this._doorPin(Math.PI / 2).distanceTo(pivotV.clone().add(new THREE.Vector2(tr.pin[0], tr.pin[1])));
    this.arm2Len = pivotV.clone().add(new THREE.Vector2(fl.pin[0], fl.pin[1])).distanceTo(new THREE.Vector2(fl.z + fl.g, fl.y));
    const makeArm = (x, len) => {
      const g = new THREE.Group();
      const bar = mesh(new THREE.BoxGeometry(arm.t, len + arm.over * 2, arm.w), m.mech);
      bar.position.y = len / 2;
      g.add(bar);
      g.position.x = x;
      mech.add(g);
      return g;
    };
    this.arms1 = [-1, 1].map((s) => makeArm(s * arm.x1, this.arm1Len));
    this.arms2 = [-1, 1].map((s) => makeArm(s * arm.x2, this.arm2Len));
    this.trayTilt = tr.closeAngle;


    // ---- Prateleira de cartas (= teto da câmara de encomendas) ----
    const ur = SPEC.upperRail;
    const ls = SPEC.lettersShelf;
    const iw = SPEC.W / 2 - SPEC.sheet;
    mech.add(box(m.mech, -iw + 1, iw - 1, ur.y1, ur.y1 + 2, ls.z0, ls.z1));

    // ---- Aba da fenda de cartas (pendurada atrás da fenda) ----
    const sl = SPEC.slot;
    const lf = new THREE.Group();
    lf.position.set(0, sl.y1 - 2, hz - 44); // atrás do lábio da fenda, sem atravessá-lo
    mech.add(lf);
    lf.add(box(m.mech, -180, 180, -sl.y1 + sl.y0 - 6, 0, -1, 1));
    this.letterFlap = lf;
  }

  // Aba da fenda de cartas balança quando entra uma carta
  bumpLetterFlap() {
    return tween(0.7, (e, k) => {
      this.letterFlap.rotation.x = -Math.sin(Math.PI * Math.min(1, k * 1.6)) * 55 * DEG * (1 - k * 0.3);
    }, ease.linear).then(() => (this.letterFlap.rotation.x = 0));
  }

  // Pino da biela na porta (z, y) no referencial do locker, com a porta aberta em `th` rad
  _doorPin(th) {
    const { pin } = SPEC.hopper;
    const p0 = this.hopperPivotPos;
    return new THREE.Vector2(
      p0.x + pin.dy * Math.sin(th) + pin.z * Math.cos(th),
      p0.y + pin.dy * Math.cos(th) - pin.z * Math.sin(th)
    );
  }

  // Posição (referencial do locker) de um ponto do referencial da bandeja, com a bandeja girada `phiDeg`
  trayPoint(local, phiDeg) {
    const tr = SPEC.tray;
    const a = -phiDeg * DEG;
    const y = tr.floorY + local.y;
    const z = tr.front + local.z;
    return new THREE.Vector3(local.x, tr.pivot.y + y * Math.cos(a) - z * Math.sin(a), tr.pivot.z + y * Math.sin(a) + z * Math.cos(a));
  }

  _updateMechanism() {
    const th = this.hopper.angle * DEG;
    const { tray: tr, flap: fl } = SPEC;
    this.hopperPivot.rotation.x = th;

    // biela 1: pino da porta → pino da placa (gira a bandeja em torno do eixo fixo)
    const D = this._doorPin(th);
    const P = new THREE.Vector2(tr.pivot.z, tr.pivot.y);
    const phi = solveAngle(D, P, new THREE.Vector2(tr.pin[0], tr.pin[1]), this.arm1Len, (SPEC.hopper.maxAngle * DEG - th) * (tr.closeAngle / SPEC.hopper.maxAngle));
    this.trayRot.rotation.x = -phi;
    this.trayTilt = phi / DEG;
    const rot = (v, a) => new THREE.Vector2(v.x * Math.cos(a) - v.y * Math.sin(a), v.x * Math.sin(a) + v.y * Math.cos(a));
    const Q = P.clone().add(rot(new THREE.Vector2(tr.pin[0], tr.pin[1]), phi));

    // biela 2: pino da placa → pino da aba (a aba desce até a vertical)
    const Hf = new THREE.Vector2(fl.z, fl.y);
    const R = P.clone().add(rot(new THREE.Vector2(fl.pin[0], fl.pin[1]), phi));
    const a2 = solveAngle(R, Hf, new THREE.Vector2(fl.g, 0), this.arm2Len, -0.53 * phi);
    const psi = -a2;
    this.topFlap.rotation.x = psi;
    const G = Hf.clone().add(rot(new THREE.Vector2(fl.g, 0), a2));
    this.flapAngle = psi / DEG;

    const q = new THREE.Quaternion();
    const place = (groups, from, to) => {
      const dir = to.clone().sub(from).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, dir.y, dir.x));
      for (const g of groups) {
        g.quaternion.copy(q);
        g.position.y = from.y;
        g.position.z = from.x;
      }
    };
    place(this.arms1, D, Q);
    place(this.arms2, R, G);
  }

  _applyExplode(v) {
    const e = ease.inOutCubic(v);
    for (const [name, g] of Object.entries(this.parts)) {
      g.position.copy(this.explodeOffsets[name]).multiplyScalar(e);
    }
  }

  // ---------- API ----------
  get hopperOpen() {
    return this.hopper.target > 1;
  }
  // Compatibilidade: porta frontal
  get door() {
    return this.doors.front;
  }

  doorOpen(which = 'front') {
    return this.doors[which].target > 1;
  }

  anyDoorOpen(minAngle = 60) {
    return Object.values(this.doors).some((d) => d.angle >= minAngle);
  }

  setHopperAngle(deg, immediate = false) {
    const v = THREE.MathUtils.clamp(deg, 0, SPEC.hopper.maxAngle);
    this.hopper.target = v;
    if (immediate) this.hopper.angle = v;
  }

  toggleHopper() {
    this.setHopperAngle(this.hopperOpen ? 0 : SPEC.hopper.maxAngle);
    return { ok: true };
  }

  waitHopper() {
    return new Promise((res) => {
      const check = () => (Math.abs(this.hopper.angle - this.hopper.target) < 0.05 ? res() : setTimeout(check, 16));
      check();
    });
  }

  toggleDoor(which = 'front') {
    const d = this.doors[which];
    const name = which === 'front' ? 'Porta frontal' : 'Porta traseira';
    if (this.doorOpen(which)) {
      d.target = 0;
      return { ok: true };
    }
    if (d.locked || d.busy) {
      this._shakeDoor(d);
      sfx.deny();
      return { ok: false, msg: `${name} trancada — destranque a fechadura primeiro` };
    }
    d.target = SPEC.door.maxAngle;
    sfx.metal();
    return { ok: true };
  }

  _shakeDoor(d) {
    tween(0.35, (e, k) => {
      d.shake = Math.sin(k * Math.PI * 7) * 0.9 * (1 - k);
    }, ease.linear);
  }

  async toggleLock(which = 'front') {
    const d = this.doors[which];
    if (d.busy) return { ok: false };
    if (!d.locked && d.angle > 0.5) {
      return { ok: false, msg: `Feche a porta ${which === 'front' ? 'frontal' : 'traseira'} antes de trancar` };
    }
    d.busy = true;
    const locking = !d.locked;
    const turn = (from, to) =>
      tween(0.38, (e) => {
        const a = THREE.MathUtils.lerp(from, to, e) * DEG;
        d.cam.rotation.z = a;
        d.keyInner.rotation.z = a;
      });
    if (!locking) {
      d.key.visible = true;
      await tween(0.28, (e) => (d.key.position.z = (1 - e) * 60), ease.outCubic);
      await turn(0, 90);
      sfx.lock();
      d.locked = false;
    } else {
      await turn(90, 0);
      sfx.lock();
      d.locked = true;
      await tween(0.25, (e) => (d.key.position.z = e * 60), ease.inQuad);
      d.key.visible = false;
    }
    d.busy = false;
    return { ok: true };
  }

  setExplode(on) {
    this.explode.target = on ? 1 : 0;
  }

  setSectionCut(on) {
    this.sidePanelR.visible = !on;
  }

  reset() {
    this.hopper.target = 0;
    for (const d of Object.values(this.doors)) d.target = 0;
  }

  buildEdges(material) {
    this.edges = [];
    const meshes = [];
    this.root.traverse((o) => {
      if (o.isMesh && !o.userData.noEdges) meshes.push(o);
    });
    const cache = new Map();
    for (const o of meshes) {
      let eg = cache.get(o.geometry);
      if (!eg) {
        eg = new THREE.EdgesGeometry(o.geometry, 35);
        cache.set(o.geometry, eg);
      }
      const ls = new THREE.LineSegments(eg, material);
      ls.raycast = () => {};
      ls.userData.edgeOf = o;
      o.add(ls);
      this.edges.push(ls);
    }
  }

  setEdges(on) {
    for (const e of this.edges ?? []) e.visible = on;
  }

  update(dt) {
    const prevH = this.hopper.angle;
    this.hopper.angle = approach(this.hopper.angle, this.hopper.target, dt, 6, 40);
    if (prevH > 0.5 && this.hopper.angle === 0 && this.hopper.target === 0) sfx.metal();

    for (const d of Object.values(this.doors)) {
      const prev = d.angle;
      d.angle = approach(d.angle, d.target, dt, 5, 45);
      if (prev > 0.3 && d.angle === 0) sfx.metal();
      d.pivot.rotation.y = (d.angle + d.shake) * DEG;
    }

    this._updateMechanism();

    if (this.explode.v !== this.explode.target) {
      this.explode.v = approach(this.explode.v, this.explode.target, dt, 3.2, 0.25);
      this._applyExplode(this.explode.v);
    }
  }
}
