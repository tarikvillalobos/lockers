// Braço robótico industrial de 6 eixos, procedural, com cinemática inversa analítica.
// O alvo é a ponta da ferramenta (TCP) em coordenadas do mundo + orientação (rumo e inclinação).
import * as THREE from 'three';
import { M, box, rbox, cyl, tube, group, bakeChildren } from './kit.js';

const D = { d1: 0.78, a1: 0.26, L2: 1.12, L3: 1.18, d6: 0.16 };
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0),
  Y = new THREE.Vector3(0, 1, 0);

function boneGeometry(len, r0, r1, thick) {
  // contorno "osso": dois círculos ligados pelas tangentes, extrudado na espessura (eixo X do braço)
  const s = new THREE.Shape();
  const a = Math.asin((r0 - r1) / len);
  s.absarc(0, 0, r0, Math.PI / 2 + a, (3 * Math.PI) / 2 - a, false);
  s.absarc(len, 0, r1, -Math.PI / 2 - a, Math.PI / 2 + a, false);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 20 });
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)));
  g.translate(thick / 2, 0, 0);
  return g;
}

// ---------- ferramentas (crescem em +z do punho) ----------
export function vacuumTool(w = 0.5, l = 0.3, nx = 3, ny = 2) {
  const g = new THREE.Group();
  g.add(cyl(M.dark, 0.04, 0.1, 0, 0, 0.05, 'z'));
  g.add(rbox(M.alu, w, 0.04, 0.03, 0, -0.02, 0.115, 0.006));
  const zc = 0.115;
  for (let i = 0; i < ny; i++) {
    const y = ny === 1 ? 0 : -l / 2 + (l * i) / (ny - 1);
    const bar = rbox(M.alu, w, 0.03, 0.03, 0, y - 0.015, zc, 0.005);
    g.add(bar);
    for (let j = 0; j < nx; j++) {
      const x = nx === 1 ? 0 : -w / 2 + 0.03 + ((w - 0.06) * j) / (nx - 1);
      g.add(cyl(M.steel, 0.008, 0.03, x, y, zc + 0.03, 'z', 8));
      g.add(cyl(M.rubber, 0.03, 0.022, x, y, zc + 0.054, 'z', 14, 0.018));
    }
  }
  if (ny > 1) for (const x of [-w / 4, w / 4]) g.add(rbox(M.alu, 0.03, l, 0.03, x, -l / 2, zc, 0.005));
  g.userData.len = zc + 0.065;
  return g;
}
export function torchTool() {
  const g = new THREE.Group();
  g.add(rbox(M.dark, 0.07, 0.07, 0.1, 0, -0.035, 0.05, 0.01));
  g.add(cyl(M.plastic, 0.022, 0.2, 0, 0, 0.19, 'z', 12));
  g.add(cyl(M.copper, 0.016, 0.06, 0, 0, 0.31, 'z', 12, 0.011));
  g.add(cyl(M.steel, 0.003, 0.02, 0, 0, 0.35, 'z', 6));
  g.userData.len = 0.36;
  return g;
}
export function gripperTool(span = 0.12) {
  const g = new THREE.Group();
  g.add(cyl(M.dark, 0.04, 0.06, 0, 0, 0.03, 'z'));
  g.add(rbox(M.alu, span + 0.08, 0.07, 0.05, 0, -0.035, 0.085, 0.008));
  for (const s of [-1, 1]) g.add(rbox(M.steel, 0.018, 0.05, 0.12, (s * span) / 2, -0.025, 0.17, 0.004));
  g.userData.len = 0.2;
  return g;
}
export function screwTool() {
  const g = new THREE.Group();
  g.add(rbox(M.anthracite, 0.09, 0.09, 0.14, 0, -0.045, 0.07, 0.012));
  g.add(cyl(M.steel, 0.02, 0.14, 0, 0, 0.21, 'z', 12));
  g.add(cyl(M.chrome, 0.008, 0.06, 0, 0, 0.31, 'z', 8));
  g.userData.len = 0.34;
  return g;
}

export class Robot {
  constructor({ scale = 1, tool = vacuumTool(), paint = M.robot, pedestal = 0 } = {}) {
    this.s = scale;
    this.group = new THREE.Group();
    this.group.scale.setScalar(scale);
    this.target = new THREE.Vector3(0, 1.2, 1.4);
    this.toolQ = new THREE.Quaternion();
    this.reachOk = true;
    const g = this.group;

    if (pedestal > 0) {
      const hp = pedestal / scale;
      g.add(rbox(M.anthracite, 0.72, hp, 0.72, 0, -hp, 0, 0.02));
      g.add(box(M.iron, 0.9, 0.03, 0.9, 0, -hp, 0));
    }
    // base fixa
    g.add(cyl(M.iron, 0.4, 0.05, 0, 0, 0));
    g.add(cyl(paint, 0.34, 0.2, 0, 0.05, 0, 'y', 32, 0.29));
    g.add(cyl(M.dark, 0.3, 0.03, 0, 0.25, 0, 'y', 32));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(cyl(M.steel, 0.018, 0.02, Math.cos(a) * 0.35, 0.05, Math.sin(a) * 0.35, 'y', 6));
    }
    g.add(rbox(M.dark, 0.16, 0.12, 0.1, 0, 0.08, -0.36, 0.01)); // caixa de conectores

    // J1: torre giratória
    const j1 = (this.j1 = new THREE.Group());
    j1.position.y = 0.28;
    g.add(j1);
    j1.add(cyl(paint, 0.29, 0.14, 0, 0, 0, 'y', 32, 0.27));
    j1.add(rbox(paint, 0.5, 0.42, 0.56, 0, 0.1, 0.06, 0.06, 4));
    j1.add(rbox(M.dark, 0.2, 0.2, 0.26, 0, 0.16, -0.32, 0.02)); // motor do J1
    const sy = D.d1 - 0.28;
    j1.add(cyl(paint, 0.22, 0.4, 0.0, sy, D.a1, 'x', 32));
    j1.add(cyl(M.dark, 0.2, 0.03, -0.215, sy, D.a1, 'x', 32));
    j1.add(cyl(M.dark, 0.12, 0.24, -0.33, sy, D.a1, 'x', 20)); // motor do J2
    j1.add(cyl(M.plastic, 0.125, 0.02, -0.46, sy, D.a1, 'x', 20));

    // J2: braço
    const j2 = (this.j2 = new THREE.Group());
    j2.position.set(0, sy, D.a1);
    j1.add(j2);
    const arm = new THREE.Mesh(boneGeometry(D.L2, 0.2, 0.15, 0.16), paint);
    arm.position.x = 0.29;
    j2.add(arm);
    j2.add(cyl(M.dark, 0.14, 0.03, 0.385, 0, 0, 'x', 28));
    j2.add(rbox(M.anthracite, 0.012, 0.11, 0.52, 0.378, -0.055, D.L2 * 0.5, 0.004));
    j2.add(tube(M.rubber, [[0.16, 0.2, 0.0], [0.19, 0.27, D.L2 * 0.3], [0.19, 0.24, D.L2 * 0.7], [0.14, 0.2, D.L2 - 0.02]], 0.03, false, 24, 8));

    // J3: cotovelo + antebraço
    const j3 = (this.j3 = new THREE.Group());
    j3.position.set(0, 0, D.L2);
    j2.add(j3);
    j3.add(cyl(paint, 0.165, 0.42, 0.06, 0, 0, 'x', 28));
    j3.add(cyl(M.dark, 0.15, 0.03, 0.385, 0, 0, 'x', 28));
    j3.add(cyl(M.dark, 0.1, 0.2, -0.24, 0, 0, 'x', 18)); // motor do J3
    j3.add(rbox(paint, 0.26, 0.27, 0.5, 0, -0.135, 0.2, 0.05, 4));
    j3.add(rbox(M.dark, 0.2, 0.16, 0.2, 0, 0.13, -0.02, 0.02)); // motores do punho
    j3.add(cyl(paint, 0.105, D.L3 - 0.5, 0, 0, 0.44 + (D.L3 - 0.5) / 2, 'z', 24, 0.085));
    j3.add(cyl(M.dark, 0.11, 0.04, 0, 0, 0.47, 'z', 24));
    this.forearm = j3;

    // punho (J4–J6 como junta esférica) + flange
    const wrist = (this.wrist = new THREE.Group());
    wrist.position.set(0, 0, D.L3);
    j3.add(wrist);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), paint);
    wrist.add(ball);
    wrist.add(cyl(M.dark, 0.078, D.d6 - 0.02, 0, 0, D.d6 / 2 + 0.03, 'z', 20));
    wrist.add(cyl(M.chrome, 0.09, 0.025, 0, 0, D.d6 + 0.0, 'z', 24));
    const toolNode = new THREE.Group();
    toolNode.position.z = D.d6 + 0.012;
    wrist.add(toolNode);
    this.toolNode = toolNode;
    this.setTool(tool);
    for (const n of [g, j1, j2, j3, wrist]) bakeChildren(n);
    this.home = { yaw: 0, pitch: Math.PI / 2 };
  }

  setTool(tool) {
    this.toolNode.clear();
    this.toolNode.add(bakeChildren(tool));
    this.toolLen = D.d6 + 0.012 + (tool.userData.len ?? 0.2);
  }

  place(x, z, yaw = 0, y = 0) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    this.group.updateMatrixWorld(true);
    return this;
  }

  // alcance aproximado (m) até a ponta da ferramenta
  get reach() {
    return (D.a1 + D.L2 + D.L3) * this.s;
  }

  // TCP no mundo; yaw = rumo da ferramenta; pitch = π/2 aponta para baixo, 0 = horizontal
  solve(target, yaw = 0, pitch = Math.PI / 2, roll = 0) {
    this.target.copy(target);
    this.toolQ.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
    const dir = _v.set(0, 0, 1).applyQuaternion(this.toolQ);
    const W = new THREE.Vector3().copy(target).addScaledVector(dir, -this.toolLen * this.s);
    const g = this.group;
    const p = g.worldToLocal(W);
    const th1 = Math.atan2(p.x, p.z);
    const r = Math.hypot(p.x, p.z) - D.a1;
    const h = p.y - D.d1;
    const dist = Math.hypot(r, h);
    const max = D.L2 + D.L3 - 0.01,
      min = Math.abs(D.L2 - D.L3) + 0.12;
    this.reachOk = dist <= max;
    const d = Math.min(max, Math.max(min, dist));
    const E = Math.acos(THREE.MathUtils.clamp((D.L2 * D.L2 + D.L3 * D.L3 - d * d) / (2 * D.L2 * D.L3), -1, 1));
    const phi = Math.atan2(h, r) + Math.acos(THREE.MathUtils.clamp((D.L2 * D.L2 + d * d - D.L3 * D.L3) / (2 * D.L2 * d), -1, 1));
    this.j1.rotation.y = th1;
    this.j2.rotation.x = -phi;
    this.j3.rotation.x = Math.PI - E;
    // punho: orientação absoluta da ferramenta
    _q.copy(g.quaternion);
    _q.multiply(_q2.setFromAxisAngle(Y, th1));
    _q.multiply(_q2.setFromAxisAngle(X, -phi + Math.PI - E));
    this.wrist.quaternion.copy(_q.invert()).multiply(this.toolQ);
  }
}

// ---------- trilhas (quadros-chave ao longo do ciclo) ----------
// keys: [{ u, p: [x, y, z] | (u) => [x, y, z], yaw, pitch, lift }] em ordem de u (0..1). A trilha é cíclica.
// `lift` ergue o trajeto entre a chave anterior e esta (arco), em metros.
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3();
const P = (k, u, out) => {
  const p = typeof k.p === 'function' ? k.p(u) : k.p;
  return out.set(p[0], p[1], p[2]);
};
export function evalTrack(keys, u, out = {}) {
  const n = keys.length;
  let i = 0;
  while (i < n && keys[i].u <= u) i++;
  const k0 = keys[(i - 1 + n) % n],
    k1 = keys[i % n];
  let u0 = k0.u,
    u1 = k1.u;
  if (i === 0) u0 -= 1;
  if (i === n) u1 += 1;
  const span = Math.max(1e-6, u1 - u0);
  let t = (u - u0) / span;
  t = t * t * (3 - 2 * t);
  P(k0, u, _a);
  P(k1, u, _b);
  out.pos = (out.pos ?? new THREE.Vector3()).lerpVectors(_a, _b, t);
  if (k1.lift) out.pos.y += k1.lift * Math.sin(Math.PI * t);
  const y0 = k0.yaw ?? 0,
    y1 = k1.yaw ?? 0;
  const dy = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0));
  out.yaw = y0 + dy * t;
  const p0 = k0.pitch ?? Math.PI / 2,
    p1 = k1.pitch ?? Math.PI / 2;
  out.pitch = p0 + (p1 - p0) * t;
  return out;
}

export { D as ROBOT_DIMS, group };
