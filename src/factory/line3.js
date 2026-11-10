// Célula de solda dos conjuntos: um robô posiciona as peças na mesa e um robô MIG solda.
// A cada ciclo sai um conjunto, na sequência: porta da frente (com as ripas), porta de trás, tampa da
// eletrônica, base, tampo, basculante (com as ripas) e bandeja (piso + placas).
import * as THREE from 'three';
import { M, lerp, seg, shadows } from './kit.js';
import { POS } from './layout.js';
import { Robot, evalTrack, gripperTool, torchTool } from './robot.js';
import * as EQ from './equipment.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _t = {};
const up = (p, d) => [p[0], p[1] + d, p[2]];

export function buildWeld2(ctx) {
  const { scene, A, sparks, updaters, robots } = ctx;
  const add = (o) => (scene.add(o), o);
  const W = POS.weld2;

  const table = EQ.weldTable(1.5, 1.1, W.h);
  table.position.set(W.x, 0, W.z);
  add(table);
  const cartIn = V(W.x + 1.9, 0, W.z + 1.0),
    cartOut = V(W.x + 2.9, 0, W.z - 0.2);
  for (const [c, ry] of [[cartIn, 0], [cartOut, Math.PI / 2]]) {
    const k = EQ.partsCart(1.1, 0.8);
    k.position.copy(c);
    k.rotation.y = ry;
    add(k);
  }
  // pilha de recortes dobrados no carrinho de entrada e conjuntos prontos no de saída (cenário)
  {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.022, 0.38), M.sheet);
      b.position.set(-0.2, 0.235 + i * 0.024, 0.05);
      g.add(b);
    }
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.06, 0.03), M.sheet);
      b.position.set(0.28, 0.25, -0.2 + i * 0.09);
      g.add(b);
    }
    g.position.copy(cartIn);
    add(shadows(g));
  }
  const r14 = (robots.r14 = new Robot({ scale: 0.95, tool: torchTool() }).place(W.x - 1.55, W.z + 0.1, Math.PI / 2));
  const r15 = (robots.r15 = new Robot({ scale: 0.95, tool: gripperTool(0.1) }).place(W.x + 1.5, W.z - 0.85, -Math.PI / 2));
  add(r14.group);
  add(r15.group);
  const src = EQ.weldSource();
  src.position.set(W.x - 2.0, 0, W.z - 0.9);
  add(src);
  add(EQ.fenceRun([[W.x - 2.4, W.z + 1.5], [W.x + 0.9, W.z + 1.5]], 1.9));
  add(EQ.fenceRun([[W.x - 2.4, W.z - 1.35], [W.x - 2.4, W.z + 1.5]], 1.9));
  const light = new THREE.PointLight(0x9fd0ff, 0, 6, 1.6);
  add(light);

  // ---- conjuntos ----
  const defs = [
    { rx: -90, pieces: [['LR-030', 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ['LR-040', i])] },
    { rx: 90, pieces: [['LR-030', 1], ...[8, 9, 10, 11, 12, 13, 14, 15].map((i) => ['LR-040', i])] },
    { rx: 90, pieces: [['LR-031', 0]] },
    { rx: 0, pieces: [['LR-001', 0]] },
    { rx: 0, pieces: [['LR-002', 0]] },
    { rx: -90, pieces: [['LR-050', 0], ['LR-042', 0], ['LR-042', 1], ['LR-042', 2]] },
    { rx: 90, pieces: [['LR-060', 0], ['LR-061', 0], ['LR-061', 1]] },
  ];
  const pickP = [cartIn.x, 1.15, cartIn.z];
  const outP = [cartOut.x, 0.75, cartOut.z];
  const home15 = [W.x + 1.0, 1.9, W.z - 0.3];
  const home14 = [W.x - 0.75, 1.6, W.z + 0.1];
  const yawTo = (p) => Math.atan2(p[0] - (W.x - 1.55), p[2] - (W.z + 0.1));

  const items = defs.map((def) => {
    const g = new THREE.Group();
    g.rotation.x = (def.rx * Math.PI) / 180;
    const pieces = def.pieces.map(([id, i]) => {
      const mat = A.byId.get(id).mat.startsWith('gi') ? M.galv : M.sheet;
      const h = A.placedOne(id, i, mat);
      g.add(h);
      return { h };
    });
    add(g);
    // apoia o conjunto deitado sobre a mesa, centralizado
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g);
    const c = bb.getCenter(new THREE.Vector3());
    const rest = V(W.x - c.x, W.h + 0.004 - bb.min.y, W.z - c.z);
    g.position.copy(rest);
    g.updateMatrixWorld(true);
    const qInv = g.quaternion.clone().invert();
    const n = pieces.length;
    const stepU = 0.74 / Math.max(n, 4);
    const k15 = [{ u: 0, p: home15 }];
    const k14 = [{ u: 0, p: home14, yaw: Math.PI / 2, pitch: 0.7 }];
    const welds = [];
    pieces.forEach((pc, k) => {
      const pb = new THREE.Box3().setFromObject(pc.h);
      const top = [(pb.min.x + pb.max.x) / 2, pb.max.y, (pb.min.z + pb.max.z) / 2];
      const a = 0.06 + k * stepU;
      const tPick = a + 0.12 * stepU,
        tPlace = a + 0.45 * stepU;
      pc.a = a;
      pc.tPick = tPick;
      pc.tPlace = tPlace;
      pc.top = top;
      pc.qInv = qInv;
      k15.push({ u: tPick - 0.1 * stepU, p: up(pickP, 0.2) }, { u: tPick, p: pickP }, { u: tPlace, p: top, lift: 0.3 }, { u: tPlace + 0.1 * stepU, p: up(top, 0.25) });
      // pontos de solda: nas duas pontas da peça (ou nos 4 cantos, se for peça única)
      const long = pb.max.x - pb.min.x >= pb.max.z - pb.min.z;
      const pts = n === 1 ? [[pb.min.x, pb.min.z], [pb.max.x, pb.min.z], [pb.max.x, pb.max.z], [pb.min.x, pb.max.z]] : long ? [[pb.min.x + 0.02, top[2]], [pb.max.x - 0.02, top[2]]] : [[top[0], pb.min.z + 0.02], [top[0], pb.max.z - 0.02]];
      const w0 = tPlace + 0.1 * stepU,
        w1 = n === 1 ? 0.8 : a + 0.98 * stepU;
      pts.forEach((pt, j) => {
        const t0 = w0 + ((w1 - w0) * j) / pts.length,
          t1 = w0 + ((w1 - w0) * (j + 0.8)) / pts.length;
        const p = [pt[0], pb.max.y + 0.004, pt[1]];
        k14.push({ u: t0 - 0.006, p: up(p, 0.1), yaw: yawTo(p), pitch: 0.9 }, { u: t0, p, yaw: yawTo(p), pitch: 0.9 }, { u: t1, p, yaw: yawTo(p), pitch: 0.9 });
        welds.push({ t0, t1, p: V(...p) });
      });
    });
    k15.push({ u: 0.84, p: up([rest.x + c.x, bb.max.y - bb.min.y + W.h, rest.z + c.z], 0.25) }, { u: 0.87, p: [W.x, W.h + (bb.max.y - bb.min.y), W.z] }, { u: 0.94, p: outP, lift: 0.3 }, { u: 0.975, p: up(outP, 0.3) }, { u: 0.999, p: home15 });
    k14.push({ u: 0.84, p: home14, yaw: Math.PI / 2, pitch: 0.7 }, { u: 0.999, p: home14, yaw: Math.PI / 2, pitch: 0.7 });
    k14.sort((x, y) => x.u - y.u);
    return { g, pieces, rest, k15, k14, welds, h: bb.max.y - bb.min.y };
  });

  const off = new THREE.Vector3();
  updaters.push((c) => {
    const { u, cycle } = c;
    const k = ((cycle % items.length) + items.length) % items.length;
    const it = items[k];
    for (const o of items) o.g.visible = o === it && u < 0.955;
    const t15 = evalTrack(it.k15, u, _t);
    r15.solve(t15.pos, 0);
    const p15 = t15.pos.clone();
    // conjunto: na mesa até 0,87; depois vai com o robô para o carrinho de saída
    if (u < 0.87) it.g.position.copy(it.rest);
    else it.g.position.set(it.rest.x + (p15.x - W.x), it.rest.y + (p15.y - (W.h + it.h)), it.rest.z + (p15.z - W.z));
    for (const pc of it.pieces) {
      pc.h.visible = u >= pc.tPick;
      if (u >= pc.tPick && u < pc.tPlace) {
        // a peça segue o TCP: deslocamento (no mundo) convertido para o referencial do conjunto
        off.set(p15.x - (it.rest.x - it.rest.x + pc.top[0]), p15.y - pc.top[1], p15.z - pc.top[2]).applyQuaternion(pc.qInv);
        pc.h.position.copy(off);
      } else pc.h.position.set(0, 0, 0);
    }
    const t14 = evalTrack(it.k14, u, _t);
    r14.solve(t14.pos, t14.yaw, t14.pitch);
    let on = false;
    for (const w of it.welds) if (u >= w.t0 && u <= w.t1) on = true;
    if (on) {
      sparks.emit(t14.pos, V(0, 1, 0), 3, { speed: 2.2, spread: 1.0, life: 0.45 });
      light.position.set(t14.pos.x, t14.pos.y + 0.1, t14.pos.z);
      light.intensity = 10 + Math.random() * 16;
    } else light.intensity = 0;
  });
  void lerp;
  void seg;
}
