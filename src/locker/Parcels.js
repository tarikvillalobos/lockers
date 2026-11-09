import * as THREE from 'three';
import { SPEC, DEG } from './spec.js';
import { createParcelMaterials, createLetterMaterials } from './textures.js';
import { tween, wait, ease } from '../core/tween.js';
import { sfx } from '../core/sound.js';

// Tamanhos de encomenda: w = largura (X), a = comprimento sobre a bandeja, b = altura sobre a bandeja (mm)
const PRESETS = [
  { name: 'Pequena', w: 200, a: 150, b: 90 },
  { name: 'Média', w: 290, a: 220, b: 120 },
  { name: 'Envelope', w: 320, a: 240, b: 45 },
  { name: 'Cubo', w: 180, a: 180, b: 150 },
  { name: 'Longa', w: 340, a: 130, b: 95 },
  { name: 'Caixa de sapato', w: 330, a: 200, b: 115 },
];

const BAY_VOLUME = (SPEC.bay.x1 - SPEC.bay.x0) * (SPEC.bay.z1 - SPEC.bay.z0) * (SPEC.bay.maxTop - SPEC.bay.floor);

function jitter(v, pct = 0.08) {
  return Math.round(v * (1 + (Math.random() * 2 - 1) * pct));
}

export class Parcels {
  constructor(locker) {
    this.locker = locker;
    this.group = new THREE.Group();
    this.group.name = 'Encomendas';
    locker.root.add(this.group);
    this.items = []; // encomendas no compartimento
    this.letters = []; // cartas na prateleira de cima
    this.inHopper = null;
    this.busy = false;
    this.onChange = () => {};
  }

  get letterCount() {
    return this.letters.length;
  }

  // ---------- Cartas ----------
  async depositLetter() {
    if (this.letters.length >= 40) return { ok: false, msg: 'Prateleira de cartas cheia' };
    const geo = new THREE.BoxGeometry(220, 3, 110);
    const env = new THREE.Mesh(geo, createLetterMaterials());
    env.castShadow = env.receiveShadow = true;
    const x = (Math.random() - 0.5) * 220;
    const sl = SPEC.slot;
    const yIn = (sl.y0 + sl.y1) / 2;
    env.position.set(x, yIn, SPEC.D / 2 + 140);
    this.group.add(env);
    const letter = { mesh: env };
    this.letters.push(letter);
    env.userData.letter = letter;
    const shelfY = SPEC.upperRail.y1 + 2;
    const target = new THREE.Vector3(
      THREE.MathUtils.clamp(x + (Math.random() - 0.5) * 80, -140, 140),
      shelfY + 1.5 + (this.letters.length - 1) * 3.2,
      -150 + Math.random() * 220
    );
    const yaw = (Math.random() - 0.5) * 0.6;
    this.onChange();
    // 1) entra pela fenda
    const p0 = env.position.clone();
    const p1 = new THREE.Vector3(x, yIn, SPEC.D / 2 - 20);
    this.locker.bumpLetterFlap();
    await tween(0.45, (e) => env.position.lerpVectors(p0, p1, e), ease.inOutCubic);
    // 2) escorrega pela calha (teto do nicho) e cai na prateleira
    const n = SPEC.niche;
    const p2 = new THREE.Vector3(x, n.ceilBackY + 6, n.backZ - 30);
    const q0 = env.quaternion.clone();
    const qm = new THREE.Quaternion().setFromEuler(new THREE.Euler(-18 * DEG, yaw * 0.5, 0));
    await tween(0.3, (e) => {
      env.position.lerpVectors(p1, p2, e);
      env.quaternion.slerpQuaternions(q0, qm, e);
    }, ease.inQuad);
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    await tween(0.35, (_, k) => {
      env.position.x = THREE.MathUtils.lerp(p2.x, target.x, ease.outQuad(k));
      env.position.z = THREE.MathUtils.lerp(p2.z, target.z, ease.outQuad(k));
      env.position.y = p2.y + (target.y - p2.y) * k * k;
      env.quaternion.slerpQuaternions(qm, q1, ease.outCubic(k));
    }, ease.linear);
    sfx.click();
    env.userData.action = 'letter';
    return { ok: true, msg: 'Carta depositada' };
  }

  async retrieveLetter(letter) {
    if (this.locker.doors.back.angle < 60) {
      return { ok: false, msg: 'Abra a porta traseira para pegar as cartas' };
    }
    if (letter.leaving) return { ok: false };
    letter.leaving = true;
    this.letters = this.letters.filter((l) => l !== letter);
    const env = letter.mesh;
    env.userData.action = null;
    const p0 = env.position.clone();
    const out = new THREE.Vector3(p0.x * 0.5, p0.y + 40, -620);
    await tween(0.6, (e) => {
      env.position.lerpVectors(p0, out, e);
      env.scale.setScalar(1 - e * 0.5);
    }, ease.inOutCubic);
    this._dispose(env);
    // reempilha as que ficaram
    const shelfY = SPEC.upperRail.y1 + 2;
    this.letters.forEach((l, i) => (l.mesh.position.y = shelfY + 1.5 + i * 3.2));
    this.onChange();
    return { ok: true, msg: 'Carta retirada' };
  }

  get count() {
    return this.items.length;
  }

  get occupancy() {
    const v = this.items.reduce((s, it) => s + it.w * it.d * it.h, 0);
    return Math.min(1, v / BAY_VOLUME);
  }

  _make(dims) {
    const { list, code } = createParcelMaterials();
    // deitada: w em X, b (altura) em Y, a (comprimento) em Z
    const geo = new THREE.BoxGeometry(dims.w, dims.b, dims.a);
    const mats = [list[0], list[1], list[5], list[2], list[3], list[4]]; // topo com etiqueta
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.parcel = { ...dims, code };
    return mesh;
  }

  // Procura o ponto mais baixo para apoiar uma caixa (footprint w × d, altura h)
  // Testa a caixa nas duas orientações (girada 90° ou não)
  findSpot(w, d, h, exclude = null, list = this.items) {
    const a = this._scan(w, d, h, exclude, list);
    const b = this._scan(d, w, h, exclude, list);
    if (b && (!a || b.score < a.score - 40)) return { ...b, rot: true };
    return a ? { ...a, rot: false } : null;
  }

  _scan(w, d, h, exclude, list) {
    const { x0, x1, z0, z1, floor, maxTop } = SPEC.bay;
    let best = null;
    // caixas escorregam para o fundo; lado preferido sorteado para variar o empilhamento
    const side = Math.random() < 0.5 ? -1 : 1;
    for (let x = x0 + w / 2; x <= x1 - w / 2 + 0.1; x += 12) {
      for (let z = z0 + d / 2; z <= z1 - d / 2 + 0.1; z += 12) {
        const base = this._baseAt(x, z, w, d, exclude, list);
        if (base + h > maxTop) continue;
        if (base > floor + 0.5 && this._support(x, z, w, d, base, exclude, list) < 0.6) continue;
        const score = base * 10 + (z - z0) * 0.5 + (side * x + x1) * 0.25;
        if (!best || score < best.score) best = { x, z, base, score };
      }
    }
    return best;
  }

  _baseAt(x, z, w, d, exclude, list) {
    let base = SPEC.bay.floor;
    for (const it of list) {
      if (it === exclude) continue;
      const ox = Math.abs(x - it.x) < (w + it.w) / 2 - 4;
      const oz = Math.abs(z - it.z) < (d + it.d) / 2 - 4;
      if (ox && oz) base = Math.max(base, it.base + it.h);
    }
    return base;
  }

  // Fração da base apoiada sobre o topo de outras caixas na altura `base`
  _support(x, z, w, d, base, exclude, list) {
    let area = 0;
    for (const it of list) {
      if (it === exclude || Math.abs(it.base + it.h - base) > 1) continue;
      const ox = Math.min(x + w / 2, it.x + it.w / 2) - Math.max(x - w / 2, it.x - it.w / 2);
      const oz = Math.min(z + d / 2, it.z + it.d / 2) - Math.max(z - d / 2, it.z - it.d / 2);
      if (ox > 0 && oz > 0) area += ox * oz;
    }
    return area / (w * d);
  }

  // Comprimento máximo da caixa na bandeja interna
  _maxTrayLength() {
    return SPEC.tray.length - 40;
  }

  _pickDims() {
    const order = [...PRESETS].sort(() => Math.random() - 0.5);
    for (const p of order) {
      const dims = { name: p.name, w: jitter(p.w), a: jitter(p.a), b: jitter(p.b) };
      dims.w = Math.min(dims.w, (SPEC.tray.cheek.x - 8) * 2);
      dims.b = Math.min(dims.b, SPEC.hopper.faceH - 40); // passa pela boca
      dims.a = Math.min(dims.a, this._maxTrayLength()); // cabe na bandeja
      if (this.findSpot(dims.w + 6, dims.a + 6, dims.b)) return dims;
    }
    return null;
  }

  async deposit() {
    if (this.busy) return { ok: false };
    if (this.inHopper) return { ok: false, msg: 'Já existe uma encomenda na bandeja — feche a porta' };
    const dims = this._pickDims();
    if (!dims) return { ok: false, msg: 'Locker cheio — retire as encomendas' };
    this.busy = true;
    const L = this.locker;
    L.setHopperAngle(SPEC.hopper.maxAngle);
    await L.waitHopper();

    // entra pela boca (sobre a porta aberta) e desliza até o meio da bandeja interna
    const p = this._make(dims);
    const restY = dims.b / 2 + 0.5;
    const restZ = -Math.max(dims.a / 2 + 10, SPEC.tray.length * 0.5);
    const x = (Math.random() - 0.5) * ((SPEC.tray.cheek.x - 8) * 2 - dims.w) * 0.6;
    p.position.set(x, restY + 6, 200 + dims.a / 2);
    p.rotation.set(0, (Math.random() - 0.5) * 0.3, 0);
    L.tray.add(p);
    this.inHopper = p;
    this.placing = true;
    const from = p.position.clone();
    const ry = p.rotation.y;
    await tween(0.8, (e) => {
      p.position.lerpVectors(from, new THREE.Vector3(x, restY, restZ), e);
      p.rotation.y = ry * (1 - e) * 0.5;
    }, ease.outCubic);
    this.placing = false;
    sfx.thud(0.45);
    this.onChange();

    await wait(0.8);
    L.setHopperAngle(0);
    this.busy = false;
    return { ok: true, msg: `Encomenda depositada (${dims.name.toLowerCase()})` };
  }

  // Solta a caixa quando a bandeja começa a inclinar (porta quase fechada)
  _release() {
    const p = this.inHopper;
    this.inHopper = null;
    this.group.attach(p);
    const { w, a, b } = p.userData.parcel;
    const yaw = (Math.random() - 0.5) * 10 * DEG;
    let spot = this.findSpot(w + 6, a + 6, b);
    if (!spot) {
      // sem espaço "ideal": apoia no ponto mais baixo possível, mesmo acima do limite
      spot = { x: 0, z: 0, base: this._baseAt(0, 0, w, a, null, this.items) };
    }
    const item = spot.rot
      ? { mesh: p, x: spot.x, z: spot.z, w: a + 6, d: w + 6, h: b, base: spot.base }
      : { mesh: p, x: spot.x, z: spot.z, w: w + 6, d: a + 6, h: b, base: spot.base };
    const turn = spot.rot ? Math.PI / 2 : 0;
    this.items.push(item);
    p.userData.action = 'parcel';
    p.userData.item = item;
    this._fall(item, yaw + turn);
    this.onChange();
  }

  _fall(item, yaw) {
    const p = item.mesh;
    const p0 = p.position.clone();
    const q0 = p.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const target = new THREE.Vector3(item.x, item.base + item.h / 2, item.z);
    // 1) escorrega pela bandeja inclinada até a borda de trás; 2) cai até o ponto de apoio
    const tr = SPEC.tray;
    const ta = -tr.tilt * DEG;
    const back = -tr.length - item.d * 0.15;
    const w = new THREE.Vector3(
      p0.x,
      tr.topY + (item.h / 2) * Math.cos(ta) - back * Math.sin(ta),
      tr.pivotZ + (item.h / 2) * Math.sin(ta) + back * Math.cos(ta)
    );
    const qm = new THREE.Quaternion().setFromEuler(new THREE.Euler(ta * 1.2, yaw * 0.5, 0));
    const drop = Math.max(10, w.y - target.y);
    const T = THREE.MathUtils.clamp(Math.sqrt((2 * drop) / 9810) * 1.9, 0.3, 0.75);
    return tween(0.45, (e) => {
      p.position.lerpVectors(p0, w, e);
      p.quaternion.slerpQuaternions(q0, qm, e);
    }, ease.inQuad)
      .then(() => {
        sfx.metal();
        return tween(T, (_, k) => {
          p.position.x = THREE.MathUtils.lerp(w.x, target.x, ease.outQuad(k));
          p.position.z = THREE.MathUtils.lerp(w.z, target.z, ease.outQuad(k));
          p.position.y = w.y + (target.y - w.y) * k * k;
          p.quaternion.slerpQuaternions(qm, q1, ease.outCubic(Math.min(1, k * 1.25)));
        }, ease.linear);
      })
      .then(() => {
      sfx.thud(Math.min(1, drop / 400));
      return tween(0.22, (_, k) => {
        p.position.y = target.y + Math.sin(Math.PI * k) * 7 * (1 - k);
      }, ease.linear);
    });
  }

  async retrieve(item) {
    if (!this.locker.anyDoorOpen(60)) {
      return { ok: false, msg: 'Abra uma das portas para retirar a encomenda' };
    }
    if (item.leaving) return { ok: false };
    item.leaving = true;
    this.items = this.items.filter((i) => i !== item);
    const p = item.mesh;
    p.userData.action = null;
    const p0 = p.position.clone();
    // sai pela porta que estiver aberta (frente tem prioridade)
    const outZ = this.locker.doors.front.angle >= 60 ? 620 : -620;
    const out = new THREE.Vector3(p0.x * 0.4, 360, outZ);
    sfx.click();
    await tween(0.75, (e, k) => {
      const lift = Math.sin(Math.min(1, k * 2) * Math.PI * 0.5) * 30;
      p.position.lerpVectors(p0, out, e);
      p.position.y += lift * (1 - e);
      p.scale.setScalar(1 - e * 0.55);
    }, ease.inOutCubic);
    this._dispose(p);
    this.onChange();
    this._settle();
    return { ok: true, msg: 'Encomenda retirada' };
  }

  async retrieveAll() {
    if (!this.locker.anyDoorOpen(60)) {
      return { ok: false, msg: 'Abra uma das portas para retirar as encomendas' };
    }
    const backOpen = this.locker.doors.back.angle >= 60;
    const letters = backOpen ? [...this.letters] : [];
    if (!this.items.length && !letters.length) {
      return { ok: false, msg: this.letters.length ? 'As cartas só saem pela porta traseira' : 'Nenhuma encomenda no locker' };
    }
    const sorted = [...this.items].sort((a, b) => b.base - a.base);
    for (const l of letters.reverse()) {
      this.retrieveLetter(l);
      await wait(0.08);
    }
    for (const it of sorted) {
      this.retrieve(it);
      await wait(0.18);
    }
    const parts = [];
    if (sorted.length) parts.push(`${sorted.length} encomenda(s)`);
    if (letters.length) parts.push(`${letters.length} carta(s)`);
    return { ok: true, msg: `Retirado: ${parts.join(' e ')}` };
  }

  // Reacomoda caixas que ficaram sem apoio
  _settle() {
    const sorted = [...this.items].sort((a, b) => a.base - b.base);
    const done = [];
    for (const it of sorted) {
      const base = this._baseAt(it.x, it.z, it.w, it.d, it, done);
      if (base < it.base - 0.5) {
        const p = it.mesh;
        const y0 = p.position.y;
        const y1 = base + it.h / 2;
        it.base = base;
        tween(0.35, (e) => (p.position.y = THREE.MathUtils.lerp(y0, y1, e)), ease.inQuad).then(() => sfx.thud(0.4));
      }
      done.push(it);
    }
  }

  _dispose(p) {
    p.parent?.remove(p);
    p.geometry.dispose();
    for (const m of new Set(p.material)) {
      m.map?.dispose();
      m.dispose();
    }
  }

  clear() {
    for (const it of this.items) this._dispose(it.mesh);
    this.items = [];
    for (const l of this.letters) this._dispose(l.mesh);
    this.letters = [];
    if (this.inHopper) this._dispose(this.inHopper);
    this.inHopper = null;
    this.onChange();
  }

  update() {
    const h = this.locker.hopper;
    if (this.inHopper && !this.placing && this.locker.trayTilt > 6 && h.target <= h.angle) this._release();
  }
}
