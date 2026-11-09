import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPEC, DEG } from './spec.js';
import { createHeaderDecal } from './textures.js';
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

// Barra com pontas arredondadas, comprimento ao longo de +Z local (espessura em X)
function linkBar(mat, length, width, thick) {
  const r = width / 2;
  const s = new THREE.Shape();
  s.moveTo(0, -r);
  s.lineTo(length, -r);
  s.absarc(length, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(0, r);
  s.absarc(0, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 3.2, 0, Math.PI * 2, true);
  const hole2 = new THREE.Path();
  hole2.absarc(length, 0, 3.2, 0, Math.PI * 2, true);
  s.holes.push(hole, hole2);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2); // shape X → +Z local, extrusão → X
  return mesh(g, mat);
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
    this.baffleAngle = 0;

    this._buildBody();
    this._buildFrontFrame();
    this._buildDoor('front', 0);
    this._buildDoor('back', Math.PI); // mesma porta, espelhada no fundo
    this._buildMechanism();
    this._applyExplode(0);
    this._updateMechanism();
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

    // Fundo: painel só acima da porta traseira + travessa e retornos do vão
    const back = this._part('back', [0, 0, -260]);
    const lr = SPEC.lowerRail;
    const fx = ix - stile.w; // borda interna dos montantes (187)
    const backPanel = box(m.shell, -ix, ix, lr.y1, yt, -hz + sheet, -hz + sheet * 2);
    backPanel.userData.shell = true;
    back.add(backPanel);
    back.add(box(m.body, -fx, fx, lr.y0, lr.y1, -hz, -hz + sheet));
    back.add(box(m.body, -fx, fx, lr.y0, lr.y0 + sheet, -hz + sheet, -hz + 24));
    back.add(box(m.rubber, -fx + 2, fx - 2, lr.y0 - 3, lr.y0, -hz + 6, -hz + 14));
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -fx - sheet : fx;
      back.add(box(m.body, x0, x0 + sheet, yb, lr.y0, -hz + sheet, -hz + sheet + stile.ret));
    }
  }

  _buildFrontFrame() {
    const { W, D, sheet, stile, lowerRail: lr, upperRail: ur, header } = SPEC;
    const hz = D / 2;
    const fx = W / 2 - sheet - stile.w; // borda interna dos montantes (187)
    const m = this.m;
    const g = this._part('frame', [0, 0, 230]);

    // Testeira superior (cor da frente) com gravação
    g.add(box(m.front, -fx, fx, header.y0, header.y1, hz - sheet, hz));
    const decalMat = new THREE.MeshStandardMaterial({
      map: createHeaderDecal(),
      transparent: true,
      opacity: 0.55,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(250, 47), decalMat);
    decal.position.set(0, (header.y0 + header.y1) / 2, hz + 0.3);
    decal.userData.noEdges = true;
    g.add(decal);
    this.decals.push(decalMat);

    // Travessa superior (perfil C)
    g.add(box(m.body, -fx, fx, ur.y0, ur.y1, hz - sheet, hz));
    g.add(box(m.body, -fx, fx, ur.y0, ur.y0 + sheet, hz - 30, hz - sheet));

    // Travessa inferior (perfil C)
    g.add(box(m.body, -fx, fx, lr.y0, lr.y1, hz - sheet, hz));
    g.add(box(m.body, -fx, fx, lr.y1 - sheet, lr.y1, hz - 10, hz - sheet));
    g.add(box(m.body, -fx, fx, lr.y0, lr.y0 + sheet, hz - 24, hz - sheet));

    // Vedação de borracha no batente da porta
    g.add(box(m.rubber, -fx + 2, fx - 2, lr.y0 - 3, lr.y0, hz - 14, hz - 6));
  }

  // Porta com fechadura. which = 'front' | 'back'; a traseira é a frontal girada 180° em Y,
  // então a dobradiça fica à direita e a fechadura à esquerda de quem olha por trás.
  _buildDoor(which, rotY) {
    const { D, door } = SPEC;
    const m = this.m;
    const hz = D / 2;
    const front = which === 'front';
    const part = this._part(front ? 'door' : 'doorBack', [0, 0, front ? 440 : -440]);
    part.rotation.y = rotY;
    const ds = { which, angle: 0, target: 0, shake: 0, locked: true, busy: false };
    this.doors[which] = ds;
    const pivot = new THREE.Group();
    pivot.position.set(door.pivotX, door.y0, hz);
    part.add(pivot);
    ds.pivot = pivot;

    const body = new THREE.Group();
    body.userData.action = 'door';
    body.userData.door = which;
    pivot.add(body);
    const w = door.w,
      h = door.h,
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
    // dobradiças internas
    for (const y of [60, h - 60]) {
      body.add(box(m.galv, -26, -2, y - 20, y + 20, -8, -2));
      body.add(cylX(m.galv, 4, -4, 4, y, -8, 16).rotateZ(Math.PI / 2));
    }

    // Fechadura tambor + came
    const L = door.lock;
    const lock = new THREE.Group();
    lock.position.set(L.x, L.y, 0);
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
    cam.position.z = -26;
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
    const { D, hopper: hp, baffle: bf, link } = SPEC;
    const m = this.m;
    const hz = D / 2;
    const mech = this._part('mech', [0, 0, 0]);

    // ---- Basculante ----
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
    // face frontal
    body.add(box(m.front, -fw, fw, 0, hp.faceH, -2, 0));
    // aba-puxador superior (dobrada a 45° para fora)
    body.add(strip(m.front, hp.faceW, 2, [hp.faceH, -1], [hp.faceH - 13, 12]));
    // chapa de fundo (rampa quando fechado, parede de trás quando aberto)
    const fl = hp.floor;
    body.add(strip(m.mech, hp.sideX * 2, 2, [fl.from[1], -2 - fl.from[0]], [fl.to[1], -fl.to[0]]));

    // laterais triangulares
    const s = new THREE.Shape();
    const pr = hp.profile;
    s.moveTo(pr[0][0], pr[0][1]);
    for (let i = 1; i < pr.length; i++) {
      const p = pr[i];
      if (p[0] === 'q') s.quadraticCurveTo(p[1], p[2], p[3], p[4]);
      else s.lineTo(p[0], p[1]);
    }
    s.lineTo(0, 0);
    const triGeo = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false, curveSegments: 18 });
    triGeo.rotateY(Math.PI / 2);
    for (const side of [-1, 1]) {
      const tri = mesh(triGeo, m.mech);
      tri.position.x = side < 0 ? -hp.sideX - 2 : hp.sideX;
      body.add(tri);
      // pino da biela
      body.add(cylX(m.chrome, 5, side < 0 ? -198 : hp.sideX, side < 0 ? -hp.sideX : 198, hp.pin.v, -hp.pin.u, 16));
    }

    // eixo da dobradiça do basculante + suportes laterais (fixos)
    for (const side of [-1, 1]) {
      const sx = side;
      pivot.add(cylX(m.chrome, 4.5, sx < 0 ? -200 : 180, sx < 0 ? -180 : 200, 0, 0, 16));
      mech.add(
        box(m.galv, sx < 0 ? -203 : 190, sx < 0 ? -190 : 203, this.hopperPivotPos.y - 18, this.hopperPivotPos.y + 18, this.hopperPivotPos.x - 16, this.hopperPivotPos.x + 2)
      );
    }

    // ---- Defletor anti-furto ----
    const B = new THREE.Vector2(corner.x - bf.pivot.u, corner.y + bf.pivot.v);
    this.bafflePivotPos = B;
    const Q0 = new THREE.Vector2(B.x - bf.linkPoint.du, B.y + bf.linkPoint.dv);
    this.baffleR = Q0.distanceTo(B);
    const baffle = new THREE.Group();
    baffle.position.set(0, B.y, B.x);
    mech.add(baffle);
    this.baffle = baffle;
    const bw = hp.sideX;
    baffle.add(box(m.mech, -bw, bw, -bf.length, bf.top, -1, 1));
    baffle.add(cylX(m.chrome, 5, -203, 203, 0, 0, 16)); // eixo
    for (const side of [-1, 1]) {
      baffle.add(cylX(m.chrome, 4.5, side < 0 ? -197 : bw, side < 0 ? -bw : 197, -this.baffleR, 0, 16));
      mech.add(box(m.galv, side < 0 ? -203 : 194, side < 0 ? -194 : 203, B.y - 16, B.y + 16, B.x - 14, B.x + 14));
    }

    // ---- Bielas ----
    const P0 = this._pinPosition(0);
    this.linkLength = P0.distanceTo(Q0);
    this.links = [];
    for (const side of [-1, 1]) {
      const l = linkBar(m.galv, this.linkLength, link.w, link.t);
      l.position.x = side * (link.x + link.t / 2);
      mech.add(l);
      this.links.push(l);
    }
  }

  // Posição do pino da biela (z, y) no referencial do locker para um ângulo do basculante
  _pinPosition(angleDeg) {
    const { hopper: hp } = SPEC;
    const a = angleDeg * DEG;
    const ly = hp.pin.v - hp.pivot.y; // no referencial do eixo
    const lz = -hp.pin.u + hp.pivot.u;
    const y = ly * Math.cos(a) - lz * Math.sin(a);
    const z = ly * Math.sin(a) + lz * Math.cos(a);
    return new THREE.Vector2(this.hopperPivotPos.x + z, this.hopperPivotPos.y + y);
  }

  // Mecanismo de 4 barras: basculante → biela → defletor
  _updateMechanism() {
    const P = this._pinPosition(this.hopper.angle);
    const B = this.bafflePivotPos;
    const r = this.baffleR,
      L = this.linkLength;
    const d = P.distanceTo(B);
    const a = (r * r - L * L + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r * r - a * a));
    const ex = (P.x - B.x) / d,
      ey = (P.y - B.y) / d;
    const bx = B.x + a * ex,
      by = B.y + a * ey;
    // duas soluções da interseção de círculos; usa a de baixo (defletor pendurado)
    const q1 = new THREE.Vector2(bx + h * ey, by - h * ex);
    const q2 = new THREE.Vector2(bx - h * ey, by + h * ex);
    const q = q1.y < q2.y ? q1 : q2;

    const dz = q.x - B.x,
      dy = q.y - B.y;
    this.baffle.rotation.x = Math.atan2(-dz, -dy);
    this.baffleAngle = -this.baffle.rotation.x / DEG;

    for (const l of this.links) {
      l.position.y = P.y;
      l.position.z = P.x;
      l.rotation.x = Math.atan2(-(q.y - P.y), q.x - P.x);
    }
    this.hopperPivot.rotation.x = this.hopper.angle * DEG;
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
