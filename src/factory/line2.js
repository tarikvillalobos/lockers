// Linha de produção, parte 2: descarga da pintura → montagem → teste → embalagem → paletização → expedição.
import * as THREE from 'three';
import { M, box, rbox, cyl, lerp, seg, pulse, smooth, shadows } from './kit.js';
import { POS, ROW_A, ASM_Z, B, LANE, LANE_R, STORE, FG, STATIONS } from './layout.js';
import { Robot, evalTrack, vacuumTool, gripperTool, screwTool } from './robot.js';
import { kf } from './line.js';
import * as EQ from './equipment.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _t = {};
const DEG = Math.PI / 180;
const up = (p, d) => [p[0], p[1] + d, p[2]];

// veículo: chaves [{ t, x, z, yaw, fork }] em ordem; devolve a pose interpolada
function drive(keys, t) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1],
        b = keys[i];
      const f = smooth((t - a.t) / (b.t - a.t));
      const dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), yaw: a.yaw + dy * f, fork: lerp(a.fork, b.fork, f) };
    }
  }
  return keys[keys.length - 1];
}

export function buildAsm(ctx) {
  const { scene, A, updaters, robots, path } = ctx;
  const add = (o) => (scene.add(o), o);
  const xs = POS.asm.x,
    H = POS.asm.h,
    Z = ASM_Z;
  const O = (i) => [xs[i], H, Z]; // origem do armário no posto i
  const PITCH = xs[0] - xs[1];

  const line = EQ.skidLine(xs[6] - 1.0, xs[0] + 1.6, H);
  line.position.z = Z;
  add(line);

  // ---- vistas por posto: skid + o que já chegou montado ----
  const views = xs.map((_, i) => {
    const g = new THREE.Group();
    g.add(EQ.skid());
    add(g);
    return g;
  });
  const arrive = (i, ...names) => names.forEach((n) => views[i].add(A.clone(n)));
  arrive(1, 'base', 'shell');
  arrive(2, 'base', 'shell', 'mech');
  arrive(3, 'base', 'shell', 'mech', 'doorF', 'doorB', 'hatch');
  // posto 4 (teste): armário "vivo"; posto 5 (embalagem) e 6 (fim): armário completo
  const live = A.live;
  views[4].add(live.root);
  const packLocker = A.complete();
  views[5].add(packLocker);

  // peças colocadas em cada posto (no referencial do mundo enquanto voam)
  const piece = (name, i) => {
    const o = A.clone(name);
    o.userData.home = V(...O(i));
    return add(o);
  };

  // ---- A1: base + carcaça (robô 7 descarrega a pintura) ----
  const U = ctx.U;
  const r7 = (robots.r7 = new Robot({ scale: 1.25, tool: vacuumTool(0.3, 0.5, 2, 3) }).place(U.x - 1.3, 6.9, Math.PI / 2));
  add(r7.group);
  const baseStack = V(U.x + 0.4, 0, 8.9);
  {
    const g = new THREE.Group();
    g.add(EQ.woodPallet());
    for (let i = 0; i < 10; i++) {
      const b = A.clone('base');
      b.position.y = 0.134 + i * 0.021;
      g.add(b);
    }
    g.position.copy(baseStack);
    add(shadows(g));
  }
  const stackTop = 0.134 + 10 * 0.021;
  const p1base = piece('base', 0);
  const shellMat = ctx.paintMat();
  ctx.setPaint(shellMat, 1e9);
  const p1shell = add(new THREE.Mesh(ctx.shellGeo, shellMat)); // enquanto o robô gira a carcaça
  p1shell.castShadow = true;
  const p1shellFinal = piece('shell', 0);
  const hookO = [U.x, POS.paint.hook - 1.0, U.z];
  const GR = ctx.GRIP;
  const grip = (o, yaw) => [o[0] + GR[0] * Math.cos(yaw), o[1] + GR[1], o[2] - GR[0] * Math.sin(yaw)];
  const baseTop = [xs[0], H + 0.021, Z];
  const stackPick = [baseStack.x, stackTop + 0.021, baseStack.z];
  const k7 = [
    { u: 0.0, p: [U.x - 1.0, 2.0, 8.2], yaw: 0 },
    { u: 0.13, p: up(stackPick, 0.3), yaw: 0 },
    { u: 0.16, p: stackPick, yaw: 0 },
    { u: 0.19, p: up(stackPick, 0.35), yaw: 0 },
    { u: 0.3, p: baseTop, yaw: 0, lift: 0.35 },
    { u: 0.33, p: up(baseTop, 0.4), yaw: 0 },
    { u: 0.45, p: (u) => grip(hangAt(u), -Math.PI / 2).map((v, i) => v + [0, -0.05, 0.4][i]), yaw: Math.PI, pitch: 0 },
    { u: 0.5, p: (u) => grip(hangAt(u), -Math.PI / 2), yaw: Math.PI, pitch: 0 },
    { u: 0.55, p: grip(hookO, -Math.PI / 2).map((v, i) => v + [-0.1, -0.25, 0.7][i]), yaw: Math.PI, pitch: 0 },
    { u: 0.72, p: grip(O(0), 0), yaw: -Math.PI / 2, pitch: 0, lift: 0.25 },
    { u: 0.76, p: grip(O(0), 0).map((v, i) => v + [0.45, 0.1, 0][i]), yaw: -Math.PI / 2, pitch: 0 },
    { u: 0.9, p: [U.x - 1.0, 2.0, 8.2], yaw: 0 },
  ];
  function hangAt(u) {
    const p = path.at(ctx.sU + (u - 0.5) * 2 * ctx.pitch);
    return [p.x, POS.paint.hook - 1.0, p.z];
  }
  const arch1 = EQ.stationArch('BASE', 'A1 · BASE + CARCAÇA');
  arch1.position.set(xs[0], 0, Z);
  add(arch1);
  const screw1 = EQ.screwUnit();
  add(screw1);

  // ---- A2: mecanismo (bancada de submontagem + robô colaborativo) ----
  const benchP = V(xs[1] + 1.9, 0, Z + 3.2);
  const bench = EQ.bench(1.9, 1.0);
  bench.position.copy(benchP);
  add(bench);
  const mechRest = [benchP.x - 0.1, 0.9 - 0.6, benchP.z]; // origem do armário com o mecanismo apoiado na bancada
  const r9 = (robots.r9 = new Robot({ scale: 1.2, tool: gripperTool(0.14) }).place(xs[1] - 0.2, Z + 2.25, Math.PI));
  add(r9.group);
  const p2mech = piece('mech', 1);
  const mechTop = [0, 1.0, 0.02];
  const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const k9 = [
    { u: 0.0, p: [xs[1] + 0.6, 2.2, Z + 1.6] },
    { u: 0.26, p: up(addv(mechRest, mechTop), 0.3) },
    { u: 0.3, p: addv(mechRest, mechTop) },
    { u: 0.34, p: up(addv(mechRest, mechTop), 0.5) },
    { u: 0.47, p: up(addv(O(1), mechTop), 0.62), lift: 0.15 },
    { u: 0.56, p: addv(O(1), mechTop) },
    { u: 0.6, p: up(addv(O(1), mechTop), 0.5) },
    { u: 0.8, p: [xs[1] + 0.6, 2.2, Z + 1.6] },
  ];
  // cobot montando a bandeja (piso + 2 placas) para o próximo armário
  const r8 = (robots.r8 = new Robot({ scale: 0.5, tool: gripperTool(0.08) }).place(benchP.x + 0.75, benchP.z + 0.25, -Math.PI / 2, 0.9));
  add(r8.group);
  const trayIds = ['LR-060', 'LR-061'];
  const trayParts = trayIds.map((id) => add(A.placed(id, M.galv)));
  // a bandeja é montada deitada (aberta): desfaz o giro de 90° da posição fechada
  const trayJig = V(benchP.x - 0.1, 0.905, benchP.z);
  const binP = V(benchP.x + 0.55, 0.92, benchP.z - 0.25);
  for (const [i, c] of [[0, M.blue], [1, M.red]]) {
    const b = rbox(c, 0.3, 0.14, 0.4, benchP.x + 0.55, 0.9, benchP.z - 0.25 + i * 0.0, 0.02);
    if (i === 0) add(shadows(b));
  }
  const nextMech = add(A.clone('mech'));
  const arch2 = EQ.stationArch('MECANISMO', 'A2 · BANDEJA + BASCULANTE', { color: '#b3541e' });
  arch2.position.set(xs[1], 0, Z);
  add(arch2);

  // ---- A3: portas ----
  const r10 = (robots.r10 = new Robot({ scale: 1.0, tool: vacuumTool(0.3, 0.3, 2, 2) }).place(xs[2] - 0.2, Z + 2.2, Math.PI));
  const r11 = (robots.r11 = new Robot({ scale: 1.0, tool: vacuumTool(0.3, 0.3, 2, 2) }).place(xs[2] + 0.2, Z - 2.2, 0));
  add(r10.group);
  add(r11.group);
  const cartF = V(xs[2] + 1.55, 0, Z + 1.5),
    cartB = V(xs[2] - 1.55, 0, Z - 1.5);
  for (const [cp, name, s] of [[cartF, 'doorF', 1], [cartB, 'doorB', -1]]) {
    const c = EQ.doorCart(1.0, 0.75);
    c.position.copy(cp);
    c.rotation.y = s > 0 ? 0 : Math.PI;
    add(c);
    for (let i = 1; i <= 3; i++) {
      const d = A.clone(name);
      d.position.set(cp.x, 0.2, cp.z - s * (0.19 + 0.07 * i));
      add(d);
    }
  }
  const hatchRack = V(xs[2] - 1.95, 0, Z - 0.75);
  const p3f = piece('doorF', 2),
    p3b = piece('doorB', 2),
    p3h = piece('hatch', 2);
  const cF = [0, 0.27, 0.192],
    cB = [0, 0.27, -0.192],
    cH = [0, 0.95, -0.192];
  const restF = [cartF.x, 0.2, cartF.z - 0.19],
    restB = [cartB.x, 0.2, cartB.z + 0.19],
    restH = [hatchRack.x, 0.15, hatchRack.z + 0.192];
  const k10 = [
    { u: 0.0, p: [xs[2] + 0.5, 1.9, Z + 1.3], yaw: Math.PI, pitch: 0 },
    { u: 0.16, p: addv(addv(restF, cF), [0, 0, 0.25]), yaw: Math.PI, pitch: 0 },
    { u: 0.2, p: addv(restF, cF), yaw: Math.PI, pitch: 0 },
    { u: 0.24, p: addv(addv(restF, cF), [0, 0.35, 0.25]), yaw: Math.PI, pitch: 0 },
    { u: 0.4, p: addv(addv(O(2), cF), [0, 0, 0.3]), yaw: Math.PI, pitch: 0, lift: 0.2 },
    { u: 0.46, p: addv(O(2), cF), yaw: Math.PI, pitch: 0 },
    { u: 0.5, p: addv(addv(O(2), cF), [0, 0, 0.35]), yaw: Math.PI, pitch: 0 },
    { u: 0.7, p: [xs[2] + 0.5, 1.9, Z + 1.3], yaw: Math.PI, pitch: 0 },
  ];
  const k11 = [
    { u: 0.0, p: [xs[2] - 0.5, 1.9, Z - 1.3], yaw: 0, pitch: 0 },
    { u: 0.18, p: addv(addv(restB, cB), [0, 0, -0.25]), yaw: 0, pitch: 0 },
    { u: 0.22, p: addv(restB, cB), yaw: 0, pitch: 0 },
    { u: 0.26, p: addv(addv(restB, cB), [0, 0.35, -0.25]), yaw: 0, pitch: 0 },
    { u: 0.42, p: addv(addv(O(2), cB), [0, 0, -0.3]), yaw: 0, pitch: 0, lift: 0.2 },
    { u: 0.48, p: addv(O(2), cB), yaw: 0, pitch: 0 },
    { u: 0.52, p: addv(addv(O(2), cB), [0, 0, -0.35]), yaw: 0, pitch: 0 },
    { u: 0.6, p: addv(addv(restH, cH), [0, 0.05, -0.3]), yaw: 0, pitch: 0 },
    { u: 0.64, p: addv(restH, cH), yaw: 0, pitch: 0 },
    { u: 0.68, p: addv(addv(restH, cH), [0, 0.2, -0.3]), yaw: 0, pitch: 0 },
    { u: 0.8, p: addv(addv(O(2), cH), [0, 0, -0.3]), yaw: 0, pitch: 0, lift: 0.15 },
    { u: 0.85, p: addv(O(2), cH), yaw: 0, pitch: 0 },
    { u: 0.89, p: addv(addv(O(2), cH), [0, 0, -0.35]), yaw: 0, pitch: 0 },
    { u: 0.97, p: [xs[2] - 0.5, 1.9, Z - 1.3], yaw: 0, pitch: 0 },
  ];
  {
    // suporte das tampas da eletrônica
    const g = new THREE.Group();
    g.add(box(M.blue, 0.6, 1.3, 0.05, 0, 0, 0));
    g.add(box(M.blue, 0.7, 0.04, 0.5, 0, 0, 0.2));
    g.position.set(hatchRack.x, 0, hatchRack.z + 0.05);
    add(shadows(g));
  }
  const arch3 = EQ.stationArch('PORTAS', 'A3 · FRENTE · TRÁS · TAMPA', { color: '#1f6f55' });
  arch3.position.set(xs[2], 0, Z);
  add(arch3);

  // ---- A4: eletrônica + tampo ----
  const r12 = (robots.r12 = new Robot({ scale: 1.15, tool: vacuumTool(0.3, 0.26, 2, 2) }).place(xs[3] - 0.1, Z + 2.25, Math.PI));
  add(r12.group);
  const topStack = V(xs[3] + 1.5, 0, Z + 2.5);
  {
    const g = new THREE.Group();
    g.add(EQ.woodPallet());
    for (let i = 0; i < 9; i++) {
      const b = A.clone('top');
      b.position.y = 0.134 + i * 0.021 - 1.0;
      g.add(b);
    }
    g.position.copy(topStack);
    add(shadows(g));
  }
  const pcbBin = V(xs[3] - 1.45, 0.95, Z + 2.4);
  const tb = EQ.bench(1.0, 0.7);
  tb.position.set(pcbBin.x, 0, pcbBin.z);
  add(tb);
  const pcb = add(shadows(new THREE.Group().add(rbox(M.green, 0.3, 0.012, 0.16, 0, 0, 0, 0.004), rbox(M.dark, 0.08, 0.03, 0.06, -0.07, 0.012, 0, 0.004), rbox(M.alu, 0.07, 0.035, 0.07, 0.07, 0.012, 0.02, 0.004))));
  const p4top = piece('top', 3);
  const pcbHome = [xs[3], H + 0.94, Z + 0.06];
  const topC = [0, 1.02, 0];
  const topRest = [topStack.x, 0.134 + 9 * 0.021 - 1.0, topStack.z];
  const pcbRest = [pcbBin.x, pcbBin.y, pcbBin.z];
  const k12 = [
    { u: 0.0, p: [xs[3] + 0.4, 2.1, Z + 1.5] },
    { u: 0.17, p: up(pcbRest, 0.25) },
    { u: 0.2, p: up(pcbRest, 0.03) },
    { u: 0.23, p: up(pcbRest, 0.4) },
    { u: 0.36, p: up(pcbHome, 0.5), lift: 0.3 },
    { u: 0.41, p: up(pcbHome, 0.03) },
    { u: 0.45, p: up(pcbHome, 0.6) },
    { u: 0.55, p: up(addv(topRest, topC), 0.25) },
    { u: 0.58, p: addv(topRest, topC) },
    { u: 0.62, p: up(addv(topRest, topC), 0.5) },
    { u: 0.74, p: addv(O(3), topC), lift: 0.4 },
    { u: 0.78, p: up(addv(O(3), topC), 0.4) },
    { u: 0.92, p: [xs[3] + 0.4, 2.1, Z + 1.5] },
  ];
  const arch4 = EQ.stationArch('ELETRÔNICA', 'A4 · PLACA + TAMPO', { color: '#5b3fa3' });
  arch4.position.set(xs[3], 0, Z);
  add(arch4);
  const screw4 = EQ.screwUnit();
  add(screw4);

  // ---- A5: teste ----
  const test = EQ.testPortal();
  test.group.position.set(xs[4], 0, Z);
  add(test.group);

  // ---- A6: embalagem ----
  const pack = EQ.cartonGantry();
  pack.group.position.set(xs[5], 0, Z);
  add(pack.group);
  const carton = EQ.cartonBox();
  const strapMat = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.5 });
  const mkCarton = (straps = true) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(carton.geo, carton.mats);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    g.userData.straps = [];
    if (straps)
      for (const y of [0.3, 0.8]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.476, 0.016, 0.446), strapMat);
        s.position.y = y;
        g.add(s);
        g.userData.straps.push(s);
      }
    return g;
  };
  const packCarton = add(mkCarton());
  const endCarton = mkCarton();
  views[6].add(endCarton);
  endCarton.position.y = 0;

  // ---- paletização + envolvedora ----
  const PL = POS.pallet;
  const wr = EQ.wrapper();
  wr.group.position.set(PL.x, 0, PL.z);
  wr.group.rotation.y = Math.PI;
  add(wr.group);
  const mag = EQ.palletMagazine();
  mag.position.set(PL.x, 0, PL.z + 2.6);
  add(mag);
  const TT = 0.1; // topo da plataforma
  const mkPallet = (film) => {
    const g = new THREE.Group();
    g.add(EQ.woodPallet());
    const boxes = [];
    for (const [dx, dz] of [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.24], [0.26, 0.24]]) {
      const c = mkCarton();
      c.position.set(dx, 0.134, dz);
      g.add(c);
      boxes.push(c);
    }
    const fm = M.film.clone();
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.03, 1.16, 0.96), fm);
    f.position.y = 0.134 + 0.56;
    f.visible = film;
    fm.opacity = film ? 0.32 : 0;
    g.add(f);
    return { g, boxes, film: f, fm };
  };
  const building = mkPallet(false);
  add(building.g);
  const shipping = mkPallet(true);
  add(shipping.g);
  const r13 = (robots.r13 = new Robot({ scale: 1.2, tool: vacuumTool(0.34, 0.3, 2, 2) }).place(POS.r13.x, POS.r13.z, Math.PI));
  add(r13.group);
  const flying = add(mkCarton());
  const endTop = [xs[6], H + 1.1, Z];
  const slotTop = (j) => [PL.x + [-0.26, 0.26, -0.26, 0.26][j], TT + 0.134 + 1.1, PL.z + [-0.24, -0.24, 0.24, 0.24][j]];
  const k13 = (j) => [
    { u: 0.0, p: [POS.r13.x - 0.2, 2.3, POS.r13.z - 1.4] },
    { u: 0.26, p: up(endTop, 0.3) },
    { u: 0.3, p: endTop },
    { u: 0.34, p: up(endTop, 0.45) },
    { u: 0.5, p: up(slotTop(j), 0.25), lift: 0.3 },
    { u: 0.55, p: slotTop(j) },
    { u: 0.59, p: up(slotTop(j), 0.5) },
    { u: 0.78, p: [POS.r13.x - 0.2, 2.3, POS.r13.z - 1.4] },
  ];
  const k13s = [0, 1, 2, 3].map(k13);

  // =====================================================================================
  // Logística: almoxarifado (esquerda), estoque de acabados (direita) e 3 empilhadeiras
  // =====================================================================================
  const HP = Math.PI / 2;
  const onForks = (f, d = 1.32) => [f.x + d * Math.sin(f.yaw), f.fork + 0.03, f.z + d * Math.cos(f.yaw)];

  // ---- almoxarifado: estantes de chapa, porta-paletes de insumos, itens e reposição ----
  const SR = STORE.sheetRack;
  const LV = [0.3, 1.0, 1.7, 2.4];
  const rack1 = EQ.cantileverRack(LV, [false, false, true, true], 'AÇO 2,0 mm');
  rack1.position.set(SR.x, 0, SR.z);
  add(rack1);
  const rack2 = EQ.cantileverRack(LV, [0.1, 0.12, 0.08, 0.05], '1,5 mm · GALV.');
  rack2.position.set(SR.x + 3.9, 0, SR.z);
  add(rack2);
  const slotY = [LV[1], LV[0]];
  const slotB = slotY.map((y) => {
    const b = add(EQ.sheetBundle());
    b.rotation.y = HP;
    b.position.set(SR.x, y, SR.z);
    return b;
  });
  const pick = (arr, b, li, pos) => ((b * 3 + li * 5 + pos * 2) % 9 === 7 ? null : EQ.load(arr[(b * 2 + pos + li * 3) % arr.length]));
  const rackOpts = { bays: 3, bayW: 2.4, levels: [0, 1.5, 3.0], depth: 1.1, loadYaw: HP };
  const pr = (x, ry, kinds) => {
    const r = EQ.palletRack({ ...rackOpts, fill: (b, li, pos) => pick(kinds, b, li, pos) });
    r.position.set(x, 0, 8.8);
    r.rotation.y = ry;
    add(r);
  };
  pr(-34.4, HP, ['drums', 'powder', 'wire', 'powder', 'drums', 'boxes']); // insumos de processo
  pr(-30.62, -HP, ['flats', 'film', 'straps', 'flats', 'boxes', 'pallets']); // embalagem
  pr(-29.42, HP, ['totes', 'totes', 'boxes', 'totes', 'wire']); // componentes
  for (const z of [6.5, 9.0, 11.5]) {
    const sh = EQ.binShelving(2.4, 2.3, 6); // reposição e itens miúdos
    sh.position.set(-25.75, 0, z);
    sh.rotation.y = -HP;
    add(sh);
  }
  const cage = EQ.gasCage();
  cage.position.set(-34.2, 0, 2.7);
  add(cage);
  const desk = EQ.receivingDesk();
  desk.position.set(-35.7, 0, -3.4);
  desk.rotation.y = -HP;
  add(desk);

  // ---- caminhão de chapas (corredor da esquerda) + empilhadeira do almoxarifado ----
  const TI = POS.truckIn;
  const trkIn = EQ.truck({ bedL: 5.0, open: 1, flat: true });
  add(trkIn);
  const bedIn = trkIn.userData.bed;
  const truckBundle = EQ.sheetBundle();
  truckBundle.position.set(0.45, bedIn.y, bedIn.zc);
  trkIn.add(truckBundle);
  const fk2 = EQ.forklift();
  add(fk2.group);
  const bundle = add(EQ.sheetBundle());
  const SX = POS.stack.x;
  const PKI = { x: -36.0, z: 12.3 };
  const zB = TI.z + bedIn.zc,
    xPick = TI.x + 0.45 + 1.32;
  const T_GRAB = 3.7,
    T_STORE = 4.33,
    T_TAKE = 5.37;
  ctx.sheetDrop = 6.0;
  // p = paridade do período: num período o fardo que chega vai para um nível e o laser recebe o do outro
  const inKeys = (p) => {
    const yr = slotY[p],
      yf = slotY[1 - p];
    const zi = SR.z - 1.32;
    return [
      { t: 3.5, x: PKI.x, z: PKI.z, yaw: 0, fork: 0.11 },
      { t: 3.6, x: -36.2, z: zB, yaw: -HP, fork: bedIn.y - 0.03 },
      { t: 3.68, x: xPick, z: zB, yaw: -HP, fork: bedIn.y - 0.03 },
      { t: 3.72, x: xPick, z: zB, yaw: -HP, fork: bedIn.y + 0.15 },
      { t: 3.82, x: -36.0, z: zB, yaw: -HP, fork: 0.5 },
      { t: 3.9, x: -36.0, z: 4.6, yaw: Math.PI, fork: 0.5 },
      { t: 4.0, x: -36.0, z: 1.2, yaw: Math.PI, fork: 0.5 },
      { t: 4.08, x: -34.6, z: 0.72, yaw: HP, fork: 0.5 },
      { t: 4.18, x: SR.x - 0.7, z: 0.72, yaw: HP, fork: yr + 0.12 },
      { t: 4.24, x: SR.x, z: 0.8, yaw: 0, fork: yr + 0.12 },
      { t: 4.3, x: SR.x, z: zi, yaw: 0, fork: yr + 0.12 },
      { t: 4.34, x: SR.x, z: zi, yaw: 0, fork: yr - 0.03 },
      { t: 4.42, x: SR.x, z: 0.7, yaw: 0, fork: 0.3 },
      { t: 5.26, x: SR.x, z: 0.7, yaw: 0, fork: yf - 0.03 },
      { t: 5.34, x: SR.x, z: zi, yaw: 0, fork: yf - 0.03 },
      { t: 5.38, x: SR.x, z: zi, yaw: 0, fork: yf + 0.12 },
      { t: 5.48, x: SR.x, z: 0.5, yaw: 0, fork: 0.5 },
      { t: 5.6, x: SX, z: -0.7, yaw: Math.PI, fork: 0.5 },
      { t: 5.9, x: SX, z: ROW_A + 1.32, yaw: Math.PI, fork: 0.5 },
      { t: 6.0, x: SX, z: ROW_A + 1.32, yaw: Math.PI, fork: 0.27 },
      { t: 6.1, x: SX, z: -3.0, yaw: Math.PI, fork: 0.11 },
      { t: 6.22, x: -33.4, z: 0.3, yaw: -HP, fork: 0.11 },
      { t: 6.32, x: -36.0, z: 2.2, yaw: 0, fork: 0.11 },
      { t: 6.55, x: PKI.x, z: PKI.z, yaw: 0, fork: 0.11 },
    ];
  };
  const inK = [inKeys(0), inKeys(1)];

  // ---- estoque de produto acabado (frente-direita): duas fileiras de porta-paletes ----
  const fgFill = (skip) => (b, li, pos) => (skip(b, li, pos) ? null : EQ.finishedPallet());
  const fgOpts = { bays: FG.bays, bayW: (FG.x1 - FG.x0) / FG.bays, levels: [0, 1.5, 3.0], depth: 1.2, loadYaw: HP };
  const fg1 = EQ.palletRack({ ...fgOpts, fill: fgFill((b, li, pos) => (b === 0 && li === 0) || (b * 5 + li * 3 + pos) % 11 === 4) });
  fg1.position.set((FG.x0 + FG.x1) / 2, 0, FG.z);
  add(fg1);
  const fg2 = EQ.palletRack({ ...fgOpts, fill: fgFill((b, li, pos) => (b * 7 + li * 2 + pos * 3) % 10 === 3) });
  fg2.position.set((FG.x0 + FG.x1) / 2, 0, FG.z - 1.26);
  fg2.rotation.y = Math.PI;
  add(fg2);
  const fgSlots = FG.slots.map((x) => {
    const pz = mkPallet(true);
    pz.g.position.set(x, 0, FG.z);
    pz.g.rotation.y = HP;
    add(pz.g);
    return pz;
  });

  // ---- empilhadeira 1: da envolvedora para o estoque de acabados ----
  const fk = EQ.forklift();
  add(fk.group);
  const PARK = { x: -23.9, z: 12.4, yaw: 0 };
  const GRAB = 0.08,
    DROP = 1.39;
  const fkKeys = (q) => {
    const sx = FG.slots[q];
    const wx = PL.x - 1.32;
    return [
      { t: 0.0, x: wx, z: PL.z, yaw: HP, fork: 0.11 },
      { t: 0.06, x: wx, z: PL.z, yaw: HP, fork: 0.11 },
      { t: 0.1, x: wx, z: PL.z, yaw: HP, fork: 0.36 },
      { t: 0.2, x: -23.9, z: PL.z, yaw: HP, fork: 0.36 },
      { t: 0.3, x: -23.9, z: 12.3, yaw: 0, fork: 0.36 },
      { t: 0.4, x: -22.8, z: FG.aisle, yaw: HP, fork: 0.36 },
      { t: 1.18, x: sx - 1.3, z: FG.aisle, yaw: HP, fork: 0.36 },
      { t: 1.28, x: sx, z: FG.aisle, yaw: Math.PI, fork: 0.36 },
      { t: 1.36, x: sx, z: FG.z + 1.32, yaw: Math.PI, fork: 0.36 },
      { t: 1.4, x: sx, z: FG.z + 1.32, yaw: Math.PI, fork: 0.0 },
      { t: 1.48, x: sx, z: FG.aisle, yaw: Math.PI, fork: 0.11 },
      { t: 1.58, x: sx - 1.1, z: FG.aisle, yaw: -HP, fork: 0.11 },
      { t: 2.4, x: -22.6, z: FG.aisle, yaw: -HP, fork: 0.11 },
      { t: 2.54, x: PARK.x, z: PARK.z, yaw: PARK.yaw, fork: 0.11 },
      { t: 3.72, x: PARK.x, z: PARK.z, yaw: PARK.yaw, fork: 0.11 },
      { t: 3.86, x: PL.x - 3.4, z: PL.z, yaw: HP, fork: 0.11 },
      { t: 4.0, x: wx, z: PL.z, yaw: HP, fork: 0.11 },
    ];
  };
  const fkK = [fkKeys(0), fkKeys(1)];

  // ---- caminhão de expedição (corredor da direita) + empilhadeira 3 ----
  const TO = POS.truckOut;
  const trk = EQ.truck({ open: -1 });
  add(trk);
  const bed = trk.userData.bed;
  const onTruck = [0.8, -0.8].map((dz) => {
    const pz = mkPallet(true);
    pz.g.position.set(-0.6, bed.y, bed.zc + dz);
    trk.add(pz.g);
    pz.g.visible = false;
    return pz;
  });
  const fk3 = EQ.forklift();
  add(fk3.group);
  const ship2 = mkPallet(true);
  add(ship2.g);
  const xT = TO.x - 0.6 - 1.32;
  const zT = [TO.z + bed.zc + 0.8, TO.z + bed.zc - 0.8];
  const PK3 = { x: 29.2, z: 13.0 };
  // cada viagem: vai ao nicho, pega o palete (t0 + 0,48) e solta na carroceria (t0 + 1,10)
  const TRIPS = [5.45, 6.62];
  const T_G = TRIPS.map((t) => t + 0.48),
    T_D = TRIPS.map((t) => t + 1.1);
  const trip = (t0, sx, zt, first) => [
    ...(first ? [{ t: t0, x: PK3.x, z: PK3.z, yaw: -HP, fork: 0.11 }] : []),
    { t: t0 + 0.1, x: 28.0, z: FG.aisle, yaw: -HP, fork: 0.11 },
    { t: t0 + 0.36, x: sx + 1.1, z: FG.aisle, yaw: -HP, fork: 0.11 },
    { t: t0 + 0.41, x: sx, z: FG.aisle, yaw: Math.PI, fork: 0.0 },
    { t: t0 + 0.45, x: sx, z: FG.z + 1.32, yaw: Math.PI, fork: 0.0 },
    { t: t0 + 0.49, x: sx, z: FG.z + 1.32, yaw: Math.PI, fork: 0.36 },
    { t: t0 + 0.55, x: sx, z: FG.aisle, yaw: Math.PI, fork: 0.36 },
    { t: t0 + 0.61, x: sx + 1.1, z: FG.aisle, yaw: HP, fork: 0.36 },
    { t: t0 + 0.88, x: 29.0, z: FG.aisle, yaw: HP, fork: 0.36 },
    { t: t0 + 0.94, x: 29.4, z: 12.4, yaw: Math.PI, fork: 0.5 },
    { t: t0 + 1.0, x: 30.0, z: zt, yaw: HP, fork: bed.y + 0.1 },
    { t: t0 + 1.07, x: xT, z: zt, yaw: HP, fork: bed.y + 0.1 },
    { t: t0 + 1.11, x: xT, z: zt, yaw: HP, fork: bed.y - 0.03 },
    { t: t0 + 1.17, x: 30.2, z: zt, yaw: HP, fork: 0.3 },
  ];
  const fk3Keys = [...trip(TRIPS[0], FG.slots[0], zT[0], true), ...trip(TRIPS[1], FG.slots[1], zT[1], false), { t: 7.96, x: PK3.x, z: PK3.z, yaw: -HP, fork: 0.11 }];

  // ---- adereços ----
  const sign = (title, sub, x, z, color) => {
    const sg = EQ.hangSign(title, sub, color);
    sg.position.set(x, 5.6, z);
    add(sg);
  };
  STATIONS.forEach((st, i) => {
    const pos = [[-30.2, 8.8], [-22, -3.2], [-13, -2.6], [-4.2, -3.4], [13, -3.6], [-1.0, 12.6], [-9.8, 12.6], [-16.2, 12.6], [19.6, 9.2]][i];
    sign(`${st.n} ${st.name.toUpperCase()}`, 'LINHA LR-1020', pos[0], pos[1], i >= 5 ? '#16335f' : '#1f4fa3');
  });
  const fences = [
    // célula de solda
    [[-7.4, -3.2], [-0.6, -3.2]],
    [[-7.4, -10.3], [-0.6, -10.3], [-0.6, -8.2]],
    [[-7.4, -10.3], [-7.4, -7.4]],
    // paletização
    [[-17.4, 12.6], [-22.4, 12.6]],
    [[-16.6, 7.4], [-18.4, 7.4]],
  ];
  for (const f of fences) add(EQ.fenceRun(f));
  for (const [x, z] of [[-37.0, 3.2], [-37.0, 9.6], [-36.6, -6], [31.5, 7.4], [31.5, 13.0], [28.6, 7.4]]) {
    const c = EQ.cone();
    c.position.set(x, 0, z);
    add(c);
  }
  for (const [x, z, ry] of [[8.5, 12.9, 0], [-8.5, 12.9, 0], [-13.0, 5.6, Math.PI], [-9.0, -2.9, 0]]) {
    const c = EQ.toolCabinet();
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    add(c);
  }
  for (const [x, z] of [[3.6, 12.95], [-4.6, 12.95], [-11.2, 12.95]]) {
    const r = EQ.flowRack(1.7);
    r.position.set(x, 0, z);
    r.rotation.y = Math.PI;
    add(r);
  }

  // =====================================================================================
  const doorsB = ctx.building.doors;
  const place = (o, p, yaw = 0) => {
    o.position.set(p[0], p[1], p[2]);
    o.rotation.y = yaw;
  };
  updaters.push((c) => {
    const { u, cycle, time } = c;
    const mv = seg(u, 0, 0.1);
    // skids avançam um posto
    views.forEach((g, i) => g.position.set(xs[i] + PITCH * (1 - mv), H, Z));

    // ---- A1 ----
    const t7 = evalTrack(k7, u, _t);
    r7.solve(t7.pos, t7.yaw, t7.pitch);
    p1base.visible = u >= 0.16;
    if (u < 0.3) place(p1base, [t7.pos.x, t7.pos.y - 0.021, t7.pos.z]);
    else place(p1base, O(0));
    const car = u >= 0.5 && u < 0.72;
    p1shell.visible = car;
    p1shellFinal.visible = u >= 0.72;
    if (car) {
      const sy = t7.yaw + Math.PI / 2;
      p1shell.rotation.y = sy;
      p1shell.position.set(t7.pos.x - GR[0] * Math.cos(sy), t7.pos.y - GR[1], t7.pos.z + GR[0] * Math.sin(sy));
    }
    place(p1shellFinal, O(0));
    place(screw1, [xs[0], H + 1.02 + 1.0 * (1 - pulse(u, 0.8, 0.86, 0.93, 0.98)), Z]);

    // ---- A2 ----
    const t9 = evalTrack(k9, u, _t);
    r9.solve(t9.pos, 0);
    if (u < 0.3) place(p2mech, mechRest);
    else if (u < 0.56) place(p2mech, [t9.pos.x - mechTop[0], t9.pos.y - mechTop[1], t9.pos.z - mechTop[2]]);
    else place(p2mech, O(1));
    // bancada: o cobot monta a bandeja do próximo armário
    const tw = [0.44, 0.56, 0.68];
    trayParts.forEach((tp, i) => {
      const a = tw[i];
      tp.visible = u >= a - 0.05 && u < 0.84;
      const e = seg(u, a - 0.05, a);
      // peça deitada na bancada: tira o giro de 90° da bandeja fechada
      tp.rotation.x = Math.PI / 2;
      tp.position.set(lerp(binP.x, trayJig.x, e), trayJig.y + 0.156 + 0.25 * Math.sin(Math.PI * e), lerp(binP.z, trayJig.z, e) - 0.77);
    });
    nextMech.visible = u >= 0.84;
    place(nextMech, mechRest);
    const a8 = (u * 3.0 + 0.2) % 1;
    const p8 = V(lerp(binP.x, trayJig.x, pulse(a8, 0.1, 0.45, 0.6, 0.95)), 1.25 - 0.2 * pulse(a8, 0.35, 0.5, 0.52, 0.7), lerp(binP.z, trayJig.z, pulse(a8, 0.1, 0.45, 0.6, 0.95)));
    r8.solve(p8, 0);

    // ---- A3 ----
    const t10 = evalTrack(k10, u, _t);
    r10.solve(t10.pos, t10.yaw, t10.pitch);
    if (u < 0.2) place(p3f, restF);
    else if (u < 0.46) place(p3f, [t10.pos.x - cF[0], t10.pos.y - cF[1], t10.pos.z - cF[2]]);
    else place(p3f, O(2));
    const t11 = evalTrack(k11, u, _t);
    r11.solve(t11.pos, t11.yaw, t11.pitch);
    if (u < 0.22) place(p3b, restB);
    else if (u < 0.48) place(p3b, [t11.pos.x - cB[0], t11.pos.y - cB[1], t11.pos.z - cB[2]]);
    else place(p3b, O(2));
    if (u < 0.64) place(p3h, restH);
    else if (u < 0.85) place(p3h, [t11.pos.x - cH[0], t11.pos.y - cH[1], t11.pos.z - cH[2]]);
    else place(p3h, O(2));

    // ---- A4 ----
    const t12 = evalTrack(k12, u, _t);
    r12.solve(t12.pos, 0);
    if (u < 0.2) place(pcb, pcbRest);
    else if (u < 0.41) place(pcb, [t12.pos.x, t12.pos.y - 0.03, t12.pos.z]);
    else place(pcb, pcbHome);
    pcb.visible = u < 0.74;
    if (u < 0.58) place(p4top, topRest);
    else if (u < 0.74) place(p4top, [t12.pos.x - topC[0], t12.pos.y - topC[1], t12.pos.z - topC[2]]);
    else place(p4top, O(3));
    place(screw4, [xs[3], H + 1.04 + 1.0 * (1 - pulse(u, 0.8, 0.86, 0.93, 0.98)), Z]);

    // ---- A5: teste funcional ----
    live.hopper.angle = 90 * pulse(u, 0.16, 0.3, 0.38, 0.52);
    live._updateMechanism();
    live.doors.front.pivot.rotation.y = 75 * DEG * pulse(u, 0.58, 0.7, 0.76, 0.9);
    test.bar.position.y = H + 0.08 + 1.0 * (0.5 - 0.5 * Math.cos(time * 2.2));
    const ok = u > 0.9;
    test.scrOk.visible = ok;
    test.scrRun.visible = !ok;

    // ---- A6: embalagem ----
    const dn = seg(u, 0.2, 0.5);
    const cy = H + 1.45 * (1 - dn);
    packCarton.visible = u >= 0.14;
    place(packCarton, [xs[5], cy, Z]);
    packLocker.visible = dn < 1;
    pack.slide.position.y = cy + 1.1 + 1.0 * seg(u, 0.52, 0.62) * (1 - seg(u, 0.9, 1)) + (u < 0.14 ? 0 : 0);
    packCarton.userData.straps.forEach((s, i) => (s.visible = u > 0.64 + i * 0.14));

    // ---- fim da linha + paletização ----
    const j = ((cycle % 4) + 4) % 4;
    const tau4 = j + u;
    const t13 = evalTrack(k13s[j], u, _t);
    r13.solve(t13.pos, 0);
    endCarton.visible = u < 0.3;
    const fly = u >= 0.3 && u < 0.55;
    flying.visible = fly;
    if (fly) place(flying, [t13.pos.x, t13.pos.y - 1.1, t13.pos.z]);
    // palete em formação
    const slide = seg(tau4, 0.16, 0.3);
    building.g.visible = tau4 >= 0.16;
    const spin = smooth((tau4 - 3.62) / 0.33);
    place(building.g, [PL.x, TT, PL.z + 2.6 * (1 - slide)], spin * Math.PI * 6);
    building.boxes.forEach((b, i) => (b.visible = tau4 >= i + 0.55));
    building.film.visible = tau4 > 3.6;
    building.fm.opacity = 0.32 * spin;
    wr.table.rotation.y = spin * Math.PI * 6;
    wr.car.position.y = 0.5 + 1.1 * spin * (1 - seg(tau4, 3.96, 4.0));

    // ---- empilhadeira 1: envolvedora → estoque de acabados ----
    const q = (((Math.floor(cycle / 4) % 2) + 2) % 2);
    const tau8 = c.tau8;
    const f = drive(fkK[q], tau4);
    fk.group.position.set(f.x, 0, f.z);
    fk.group.rotation.y = f.yaw;
    fk.forks.position.y = f.fork;
    const carrying = tau4 < DROP;
    shipping.g.visible = carrying;
    if (tau4 < GRAB) place(shipping.g, [PL.x, TT, PL.z]);
    else place(shipping.g, onForks(f), f.yaw - HP);
    // nichos do estoque: o palete fica ali até a empilhadeira 3 levar para o caminhão
    fgSlots[0].g.visible = tau8 >= DROP && tau8 < T_G[0];
    fgSlots[1].g.visible = tau8 >= 4 + DROP && tau8 < T_G[1];

    // ---- empilhadeira 3: estoque de acabados → caminhão ----
    const f3 = drive(fk3Keys, tau8);
    fk3.group.position.set(f3.x, 0, f3.z);
    fk3.group.rotation.y = f3.yaw;
    fk3.forks.position.y = f3.fork;
    const c3 = (tau8 >= T_G[0] && tau8 < T_D[0]) || (tau8 >= T_G[1] && tau8 < T_D[1]);
    ship2.g.visible = c3;
    if (c3) place(ship2.g, onForks(f3), f3.yaw - HP);

    // ---- caminhão de expedição: chega (4,0–4,8), recebe 2 paletes, sai (7,8–8,6) ----
    const tr = (tau8 - 7.8 + 8) % 8; // 0 = começa a sair
    let oz = TO.z,
      ovis = true;
    if (tr < 0.8) oz = TO.z + 62 * Math.pow(tr / 0.8, 2);
    else if (tr < 4.2) ovis = false;
    else if (tr < 5.0) oz = TO.z - 46 * Math.pow(1 - (tr - 4.2) / 0.8, 2);
    trk.visible = ovis;
    trk.position.set(TO.x, 0, oz);
    const loaded = (td) => ovis && (tau8 >= td || tr < 0.8);
    onTruck[0].g.visible = loaded(T_D[0]);
    onTruck[1].g.visible = loaded(T_D[1]);
    doorsB.frontR.setOpen(pulse((tr + 0.3) % 8, 0.05, 0.3, 1.15, 1.4));
    doorsB.backR.setOpen(pulse(tr, 3.95, 4.2, 4.95, 5.25));

    // ---- caminhão de chapas: sai vazio (1,2–2,0) e volta carregado (2,6–3,4) ----
    let iz = TI.z,
      ivis = true;
    if (tau8 >= 1.2 && tau8 < 2.0) iz = TI.z + 62 * Math.pow((tau8 - 1.2) / 0.8, 2);
    else if (tau8 >= 2.0 && tau8 < 2.6) ivis = false;
    else if (tau8 >= 2.6 && tau8 < 3.4) iz = TI.z - 46 * Math.pow(1 - (tau8 - 2.6) / 0.8, 2);
    trkIn.visible = ivis;
    trkIn.position.set(TI.x, 0, iz);
    truckBundle.visible = tau8 >= 2.6 && tau8 < T_GRAB;
    doorsB.front.setOpen(pulse(tau8, 0.95, 1.2, 2.05, 2.3));
    doorsB.back.setOpen(pulse(tau8, 2.35, 2.6, 3.3, 3.6));

    // ---- empilhadeira 2: caminhão → estante de chapas → laser ----
    const par = (((Math.floor(cycle / 8) % 2) + 2) % 2);
    const f2 = drive(inK[par], tau8);
    fk2.group.position.set(f2.x, 0, f2.z);
    fk2.group.rotation.y = f2.yaw;
    fk2.forks.position.y = f2.fork;
    const has = (tau8 >= T_GRAB && tau8 < T_STORE) || (tau8 >= T_TAKE && tau8 < ctx.sheetDrop);
    bundle.visible = has;
    if (has) place(bundle, onForks(f2), f2.yaw + HP);
    slotB[par].visible = tau8 >= T_STORE; // o fardo que acabou de chegar
    slotB[1 - par].visible = tau8 < T_TAKE; // o fardo que vai para o laser
  });

  void cyl;
  void B;
  void LANE;
  void LANE_R;
  void screwTool;
}

// Pintura do piso (em metros): corredores, faixas de pedestre, zonas de máquina e numeração dos postos.
export function paintFloor(x) {
  const yellow = '#e9b90c',
    white = '#eef0f1',
    green = '#2f8f5b';
  const rect = (x0, z0, x1, z1, color = yellow, w = 0.1) => {
    x.strokeStyle = color;
    x.lineWidth = w;
    x.strokeRect(x0, z0, x1 - x0, z1 - z0);
  };
  const hatch = (x0, z0, x1, z1) => {
    x.save();
    x.beginPath();
    x.rect(x0, z0, x1 - x0, z1 - z0);
    x.clip();
    x.fillStyle = '#e9b90c';
    x.fillRect(x0, z0, x1 - x0, z1 - z0);
    x.strokeStyle = '#1b1c1e';
    x.lineWidth = 0.14;
    for (let d = x0 - (z1 - z0); d < x1 + 1; d += 0.36) {
      x.beginPath();
      x.moveTo(d, z0);
      x.lineTo(d + (z1 - z0), z1);
      x.stroke();
    }
    x.restore();
  };
  // corredores de caminhões (esquerda: recebimento; direita: expedição)
  for (const L of [LANE, LANE_R]) {
    x.fillStyle = 'rgba(70,74,78,0.5)';
    x.fillRect(L.x - L.w / 2, B.z0, L.w, B.z1 - B.z0);
    x.fillStyle = yellow;
    for (const sx of [-1, 1]) x.fillRect(L.x + (sx * L.w) / 2 - 0.07, B.z0, 0.14, B.z1 - B.z0);
    x.fillStyle = white;
    for (let z = B.z0 + 1; z < B.z1; z += 3) x.fillRect(L.x - 0.06, z, 0.12, 1.5);
  }
  hatch(LANE.x + LANE.w / 2 + 0.1, 3.4, LANE.x + LANE.w / 2 + 1.0, 8.8); // descarga
  hatch(LANE_R.x - LANE_R.w / 2 - 1.5, 8.4, LANE_R.x - LANE_R.w / 2 - 0.1, 12.4); // carga
  // corredor de empilhadeira ao longo da frente
  x.fillStyle = 'rgba(86,90,95,0.42)';
  x.fillRect(-26.4, 13.42, 57.9, 1.3);
  x.fillStyle = yellow;
  x.fillRect(-26.4, 13.38, 57.9, 0.09);
  x.fillRect(-26.4, 14.68, 57.9, 0.09);
  x.fillStyle = white;
  for (let ax = -22; ax < 30; ax += 8) {
    x.beginPath();
    x.moveTo(ax, 13.95);
    x.lineTo(ax + 1.1, 13.95);
    x.lineTo(ax + 1.1, 13.78);
    x.lineTo(ax + 1.6, 14.07);
    x.lineTo(ax + 1.1, 14.36);
    x.lineTo(ax + 1.1, 14.19);
    x.lineTo(ax, 14.19);
    x.fill();
  }
  // faixas de pedestre
  const walk = (x0, z0, x1, z1) => {
    x.fillStyle = green;
    x.fillRect(x0, z0, x1 - x0, z1 - z0);
    rect(x0, z0, x1, z1, yellow, 0.08);
  };
  walk(-36.4, -12.6, -35.4, -1.2);
  walk(27.4, -12.6, 28.4, 6.6);
  walk(-24.0, -0.4, -0.6, 0.6);
  // zonas de máquina
  const zone = (x0, z0, x1, z1) => rect(x0, z0, x1, z1, yellow, 0.1);
  zone(STORE.x0, STORE.z0, STORE.x1, STORE.z1); // almoxarifado
  zone(-32.6, -9.2, -24.2, -5.0); // pórtico de chapas
  zone(-24.0, -9.4, -15.8, -5.2); // laser
  zone(-19.9, -5.9, -10.6, -3.9); // trilho do robô
  zone(-14.6, -9.9, -10.0, -6.0); // dobradeira
  zone(-7.4, -10.3, -0.6, -3.2); // solda
  zone(1.0, -9.6, 27.6, -5.0); // pintura (fileira de trás)
  zone(23.6, -5.0, 28.0, 4.0); // estufa
  zone(1.6, 3.2, 23.0, 6.0); // resfriamento
  zone(-18.6, 6.2, 9.2, 12.4); // montagem
  zone(-23.0, 7.4, -18.8, 13.2); // paletização
  zone(FG.x0 - 0.5, 7.4, FG.x1 + 0.5, 13.0); // estoque de acabados
  hatch(-23.0, 8.6, -22.0, 10.6);
  // vagas das empilhadeiras
  rect(-36.8, 11.3, -35.2, 13.4, white, 0.08);
  rect(-24.7, 11.3, -23.1, 13.3, white, 0.08);
  rect(28.2, 12.2, 30.2, 13.3, white, 0.08);
  // numeração dos postos
  x.fillStyle = 'rgba(255,255,255,0.92)';
  x.textBaseline = 'middle';
  const label = (n, name, px, pz, size = 1.1) => {
    x.font = `700 ${size}px Barlow, Arial, sans-serif`;
    x.fillText(n, px, pz);
    x.font = `600 ${size * 0.36}px Barlow, Arial, sans-serif`;
    x.fillText(name, px + size * 1.25, pz + size * 0.06);
  };
  label('01', 'ALMOXARIFADO', -34.9, 0.55, 0.9);
  label('02', 'LASER', -23.8, -4.4);
  label('03', 'DOBRA', -14.4, -2.9);
  label('04', 'SOLDA', -7.2, -2.5);
  label('05', 'PINTURA', 3.0, -4.2);
  label('06', 'MONTAGEM', 1.6, 12.95, 0.8);
  label('07', 'TESTE', -10.8, 12.95, 0.8);
  label('08', 'EMBALAGEM', -15.2, 12.95, 0.8);
  label('09', 'ESTOQUE E EXPEDIÇÃO', 12.0, 8.1, 0.9);
}
