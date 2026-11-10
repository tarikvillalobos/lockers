// Linha de produção, parte 2: descarga da pintura → montagem → teste → embalagem → paletização → expedição.
import * as THREE from 'three';
import { M, box, rbox, cyl, lerp, seg, pulse, smooth, shadows } from './kit.js';
import { POS, ROW_A, ASM_Z, B, LANE, RAW, FG, PARTS, STATIONS } from './layout.js';
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
  // Logística: três estoques, dois caminhões no mesmo corredor e as empilhadeiras
  // =====================================================================================
  const HP = Math.PI / 2;
  const onForks = (f, d = 1.32) => [f.x + d * Math.sin(f.yaw), f.fork + 0.03, f.z + d * Math.cos(f.yaw)];

  // ---- 1) INSUMOS, ao longo da parede dos fundos (frente das estantes voltada para +z) ----
  const SR = RAW.sheet;
  const LV = [0.3, 1.0, 1.7, 2.4];
  const rack1 = EQ.cantileverRack(LV, [false, false, true, true], 'AÇO 2,0 mm');
  rack1.position.set(SR.x, 0, SR.z);
  rack1.rotation.y = Math.PI;
  add(rack1);
  const rack2 = EQ.cantileverRack(LV, [0.1, 0.12, 0.08, 0.05], '1,5 mm · GALV.');
  rack2.position.set(RAW.sheet2.x, 0, SR.z);
  rack2.rotation.y = Math.PI;
  add(rack2);
  const slotY = [LV[1], LV[0]];
  const slotB = slotY.map((y) => {
    const b = add(EQ.sheetBundle());
    b.rotation.y = HP;
    b.position.set(SR.x, y, SR.z);
    return b;
  });
  const pickLoad = (arr, b, li, pos) => ((b * 3 + li * 5 + pos * 2) % 9 === 7 ? null : EQ.load(arr[(b * 2 + pos + li * 3) % arr.length]));
  const rawOpts = { bays: 3, bayW: 2.4, levels: [0, 1.5, 3.0], depth: 1.1, loadYaw: HP };
  [
    ['drums', 'powder', 'wire', 'powder', 'drums', 'boxes'], // processo: químicos, tinta em pó, arame
    ['flats', 'film', 'straps', 'flats', 'boxes', 'pallets'], // embalagem
    ['totes', 'totes', 'boxes', 'totes', 'wire'], // componentes comprados
  ].forEach((kinds, i) => {
    const r = EQ.palletRack({ ...rawOpts, fill: (b, li, pos) => pickLoad(kinds, b, li, pos) });
    r.position.set(RAW.racks[i], 0, RAW.z);
    add(r);
  });
  for (const x of RAW.shelves) {
    const sh = EQ.binShelving(2.4, 2.3, 6); // itens de reposição
    sh.position.set(x, 0, RAW.z - 0.25);
    add(sh);
  }
  const cage = EQ.gasCage();
  cage.position.set(RAW.cage.x, 0, RAW.cage.z);
  add(cage);
  const desk = EQ.receivingDesk();
  desk.position.set(-35.8, 0, -4.0);
  desk.rotation.y = -HP;
  add(desk);

  // ---- caminhão de chapas (metade de trás do corredor) + empilhadeira de insumos ----
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
  const PKI = { x: -34.4, z: -10.9, yaw: HP };
  const zB = TI.z + bedIn.zc,
    xPick = TI.x + 0.45 + 1.32;
  // linha do tempo (em ciclos, período de 8): chega 3,2–4,0 · descarrega · sai 7,5–8,3
  const T_GRAB = 4.22,
    T_STORE = 4.68,
    T_TAKE = 5.37;
  ctx.sheetDrop = 6.0;
  const zIn = SR.z + 1.32; // empilhadeira com os garfos dentro da estante
  // p = paridade do período: o fardo que chega vai para um nível e o laser recebe o do outro
  const inKeys = (p) => {
    const yr = slotY[p],
      yf = slotY[1 - p];
    return [
      { t: 4.02, x: PKI.x, z: PKI.z, yaw: PKI.yaw, fork: 0.11 },
      { t: 4.12, x: -36.2, z: zB, yaw: -HP, fork: bedIn.y - 0.03 },
      { t: 4.2, x: xPick, z: zB, yaw: -HP, fork: bedIn.y - 0.03 },
      { t: 4.24, x: xPick, z: zB, yaw: -HP, fork: bedIn.y + 0.15 },
      { t: 4.34, x: -36.0, z: zB, yaw: -HP, fork: 0.5 },
      { t: 4.44, x: -34.6, z: -11.2, yaw: HP, fork: 0.5 },
      { t: 4.54, x: SX - 0.9, z: -11.2, yaw: HP, fork: yr + 0.12 },
      { t: 4.6, x: SX, z: -11.3, yaw: Math.PI, fork: yr + 0.12 },
      { t: 4.66, x: SX, z: zIn, yaw: Math.PI, fork: yr + 0.12 },
      { t: 4.7, x: SX, z: zIn, yaw: Math.PI, fork: yr - 0.03 },
      { t: 4.78, x: SX, z: -11.3, yaw: Math.PI, fork: 0.3 },
      { t: 5.26, x: SX, z: -11.3, yaw: Math.PI, fork: yf - 0.03 },
      { t: 5.34, x: SX, z: zIn, yaw: Math.PI, fork: yf - 0.03 },
      { t: 5.38, x: SX, z: zIn, yaw: Math.PI, fork: yf + 0.12 },
      { t: 5.48, x: SX, z: -11.2, yaw: Math.PI, fork: 0.5 },
      { t: 5.72, x: SX, z: -10.6, yaw: 0, fork: 0.5 },
      { t: 5.92, x: SX, z: ROW_A - 1.32, yaw: 0, fork: 0.5 },
      { t: 6.0, x: SX, z: ROW_A - 1.32, yaw: 0, fork: 0.27 },
      { t: 6.12, x: SX, z: -10.6, yaw: 0, fork: 0.11 },
      { t: 6.3, x: PKI.x, z: PKI.z, yaw: PKI.yaw, fork: 0.11 },
    ];
  };
  const inK = [inKeys(0), inKeys(1)];

  // ---- 2) ARMÁRIOS EMBALADOS, na frente à esquerda: três fileiras de porta-paletes ----
  const fgOpts = { bays: FG.bays, bayW: (FG.x1 - FG.x0) / FG.bays, levels: [0, 1.5, 3.0], depth: 1.2, loadYaw: HP };
  const fgRack = (z, ry, skip) => {
    const r = EQ.palletRack({ ...fgOpts, fill: (b, li, pos) => (skip(b, li, pos) ? null : EQ.finishedPallet()) });
    r.position.set((FG.x0 + FG.x1) / 2, 0, z);
    r.rotation.y = ry;
    add(r);
  };
  fgRack(FG.rows.north, Math.PI, (b, li, pos) => (b * 5 + li * 3 + pos) % 11 === 4);
  // fileira do meio: os dois nichos do chão da baia mais próxima da envolvedora são os que giram
  fgRack(FG.rows.mid, 0, (b, li, pos) => (b === FG.bays - 1 && li === 0) || (b * 7 + li * 2 + pos * 3) % 10 === 3);
  fgRack(FG.rows.south, Math.PI, (b, li, pos) => (b * 3 + li * 4 + pos * 5) % 9 === 2);
  const fgSlots = FG.slots.map((x) => {
    const pz = mkPallet(true);
    pz.g.position.set(x, 0, FG.rows.mid);
    pz.g.rotation.y = HP;
    add(pz.g);
    return pz;
  });

  // ---- empilhadeira de expedição: envolvedora → estoque → caminhão ----
  const fk = EQ.forklift();
  add(fk.group);
  const TO = POS.truckOut;
  const trk = EQ.truck({ open: 1 });
  add(trk);
  const bed = trk.userData.bed;
  const onTruck = [0.8, -0.8].map((dz) => {
    const pz = mkPallet(true);
    pz.g.position.set(0.6, bed.y, bed.zc + dz);
    trk.add(pz.g);
    pz.g.visible = false;
    return pz;
  });
  const xT = TO.x + 0.6 + 1.32;
  const zT = [TO.z + bed.zc + 0.8, TO.z + bed.zc - 0.8];
  const PARK = { x: -23.9, z: 12.4, yaw: 0 };
  const zS = FG.rows.mid + 1.32; // empilhadeira com os garfos dentro do nicho
  const wx = PL.x - 1.32;
  // guarda o palete q no nicho (t0 = começo do período de 4 ciclos)
  const storeTrip = (t0, sx) => [
    { t: t0, x: wx, z: PL.z, yaw: HP, fork: 0.11 },
    { t: t0 + 0.06, x: wx, z: PL.z, yaw: HP, fork: 0.11 },
    { t: t0 + 0.1, x: wx, z: PL.z, yaw: HP, fork: 0.36 },
    { t: t0 + 0.3, x: sx + 0.4, z: FG.aisle, yaw: HP, fork: 0.36 },
    { t: t0 + 0.38, x: sx, z: FG.aisle, yaw: Math.PI, fork: 0.36 },
    { t: t0 + 0.45, x: sx, z: zS, yaw: Math.PI, fork: 0.36 },
    { t: t0 + 0.49, x: sx, z: zS, yaw: Math.PI, fork: 0.0 },
    { t: t0 + 0.56, x: sx, z: FG.aisle, yaw: Math.PI, fork: 0.11 },
  ];
  // leva o palete do nicho para a carroceria
  const loadTrip = (t0, sx, zt) => [
    { t: t0, x: sx, z: FG.aisle, yaw: Math.PI, fork: 0.0 },
    { t: t0 + 0.07, x: sx, z: zS, yaw: Math.PI, fork: 0.0 },
    { t: t0 + 0.11, x: sx, z: zS, yaw: Math.PI, fork: 0.36 },
    { t: t0 + 0.18, x: sx, z: FG.aisle, yaw: Math.PI, fork: 0.36 },
    { t: t0 + 0.26, x: sx - 1.0, z: zt, yaw: -HP, fork: 0.5 },
    { t: t0 + 0.5, x: xT + 0.9, z: zt, yaw: -HP, fork: bed.y + 0.1 },
    { t: t0 + 0.56, x: xT, z: zt, yaw: -HP, fork: bed.y + 0.1 },
    { t: t0 + 0.6, x: xT, z: zt, yaw: -HP, fork: bed.y - 0.03 },
    { t: t0 + 0.68, x: xT + 2.0, z: zt, yaw: -HP, fork: 0.3 },
  ];
  const T_L = [4.9, 5.7]; // início de cada viagem de carga
  const GRAB = 0.08,
    T_S = [0.48, 4.48], // palete entra no nicho
    T_G = T_L.map((t) => t + 0.1), // sai do nicho
    T_D = T_L.map((t) => t + 0.59); // pousa na carroceria
  const park = (t) => ({ t, x: PARK.x, z: PARK.z, yaw: PARK.yaw, fork: 0.11 });
  const fkKeys = [
    ...storeTrip(0, FG.slots[0]),
    park(0.8),
    park(3.72),
    { t: 3.86, x: PL.x - 3.4, z: PL.z, yaw: HP, fork: 0.11 },
    ...storeTrip(4.0, FG.slots[1]),
    { t: 4.78, x: FG.slots[0], z: FG.aisle, yaw: Math.PI, fork: 0.0 },
    ...loadTrip(T_L[0], FG.slots[0], zT[0]),
    { t: 5.68, x: FG.slots[1] - 0.6, z: FG.aisle, yaw: HP, fork: 0.0 },
    ...loadTrip(T_L[1], FG.slots[1], zT[1]),
    { t: 6.6, x: -30.0, z: FG.aisle, yaw: HP, fork: 0.11 },
    park(6.85),
    park(7.72),
    { t: 7.86, x: PL.x - 3.4, z: PL.z, yaw: HP, fork: 0.11 },
    { t: 8.0, x: wx, z: PL.z, yaw: HP, fork: 0.11 },
  ];

  // ---- 3) PEÇAS ACABADAS, na frente à direita: reposição para a montagem ----
  const paintGray = ctx.paintMat();
  ctx.setPaint(paintGray, 1e9);
  const capMat = new THREE.MeshPhysicalMaterial({ color: '#24282b', roughness: 0.65, metalness: 0.15 });
  const centered = (name) => {
    const g = A.single(name);
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    g.computeBoundingBox();
    return g;
  };
  const PG = { doorF: centered('doorF'), doorB: centered('doorB'), hatch: centered('hatch'), shell: centered('shell'), base: centered('base'), top: centered('top'), mech: centered('mech') };
  const mk = (geo, mat, x, y, z, rx = 0, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    return m;
  };
  const partLoad = (kind) => {
    const g = new THREE.Group();
    g.add(EQ.woodPallet());
    const y0 = 0.134;
    if (kind === 'doorF' || kind === 'doorB') {
      // portas em pé, lado a lado, num berço
      for (let i = 0; i < 9; i++) g.add(mk(PG[kind], paintGray, -0.3, y0 + 0.03, -0.36 + i * 0.09));
      for (let i = 0; i < 9; i++) g.add(mk(PG[kind], paintGray, 0.3, y0 + 0.03, -0.36 + i * 0.09));
      for (const z of [-0.45, 0.45]) g.add(mk(new THREE.BoxGeometry(1.1, 0.5, 0.03), M.blue, 0, y0 + 0.25, z));
    } else if (kind === 'hatch') {
      for (let k = 0; k < 4; k++) for (let i = 0; i < 9; i++) g.add(mk(PG.hatch, paintGray, k % 2 ? 0.3 : -0.3, y0 + 0.02 + Math.floor(k / 2) * 0.14, -0.36 + i * 0.09));
    } else if (kind === 'shell') {
      for (const x of [-0.27, 0.27]) g.add(mk(PG.shell, paintGray, x, y0, 0));
    } else if (kind === 'base' || kind === 'top') {
      for (let i = 0; i < 18; i++) for (const x of [-0.3, 0.3]) g.add(mk(PG[kind], capMat, x, y0 + i * 0.0215, 0, 0, HP));
    } else if (kind === 'mech') {
      for (const [x, z] of [[-0.3, -0.22], [0.3, -0.22], [-0.3, 0.24], [0.3, 0.24]]) g.add(mk(PG.mech, M.galv, x, y0, z));
    }
    return g;
  };
  const partKinds = ['doorF', 'shell', 'base', 'mech', 'doorB', 'top', 'hatch', 'shell', 'doorF', 'mech'];
  const pOpts = { bays: PARTS.bays, bayW: (PARTS.x1 - PARTS.x0) / PARTS.bays, levels: [0, 1.5, 3.0], depth: 1.2, loadYaw: HP };
  const pRack = (z, ry, off) => {
    const r = EQ.palletRack({ ...pOpts, fill: (b, li, pos) => ((b * 5 + li * 3 + pos + off) % 12 === 4 ? null : partLoad(partKinds[(b * 2 + pos + li * 3 + off) % partKinds.length])) });
    r.position.set((PARTS.x0 + PARTS.x1) / 2, 0, z);
    r.rotation.y = ry;
    add(r);
  };
  pRack(PARTS.z, 0, 0);
  pRack(PARTS.z - 1.26, Math.PI, 3);
  // empilhadeira de reposição, estacionada ao lado do estoque de peças
  const fk3 = EQ.forklift();
  fk3.group.position.set(28.6, 0, 9.4);
  fk3.group.rotation.y = -HP;
  add(fk3.group);

  // ---- adereços ----
  const sign = (title, sub, x, z, color) => {
    const sg = EQ.hangSign(title, sub, color);
    sg.position.set(x, 5.6, z);
    add(sg);
  };
  STATIONS.forEach((st, i) => {
    const pos = [[-27.5, -11.6], [-22, -3.2], [-13.6, -2.4], [-4.2, -3.4], [13, -3.6], [-1.0, 12.6], [-9.8, 12.6], [-16.2, 12.6], [-30.0, 9.3]][i];
    sign(`${st.n} ${st.name.toUpperCase()}`, 'LINHA LR-1020', pos[0], pos[1], i >= 5 ? '#16335f' : '#1f4fa3');
  });
  sign('ESTOQUE DE PEÇAS ACABADAS', 'PORTAS · CARCAÇAS · BASES · MECANISMOS', 19.6, 9.0, '#1f6f55');
  sign('ARMÁRIOS EMBALADOS', 'PRODUTO ACABADO', -30.0, 3.6, '#16335f');
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
  for (const [x, z] of [[-37.0, 3.0], [-37.0, 13.2], [-36.9, -4.6], [-36.9, -12.6], [-23.0, 13.6]]) {
    const c = EQ.cone();
    c.position.set(x, 0, z);
    add(c);
  }
  for (const [x, z, ry] of [[8.5, 12.9, 0], [-8.5, 12.9, 0], [-13.0, 5.6, Math.PI]]) {
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

    // ---- empilhadeira de expedição: guarda cada palete no estoque e depois carrega o caminhão ----
    const tau8 = c.tau8;
    const f = drive(fkKeys, tau8);
    fk.group.position.set(f.x, 0, f.z);
    fk.group.rotation.y = f.yaw;
    fk.forks.position.y = f.fork;
    // o palete da envolvedora: parado até a pega, depois nos garfos até entrar no nicho
    const store = tau4 < 0.48;
    const load = (tau8 >= T_G[0] && tau8 < T_D[0]) || (tau8 >= T_G[1] && tau8 < T_D[1]);
    shipping.g.visible = store || load;
    if (store && tau4 < GRAB) place(shipping.g, [PL.x, TT, PL.z]);
    else if (store || load) place(shipping.g, onForks(f), f.yaw - HP);
    fgSlots[0].g.visible = tau8 >= T_S[0] && tau8 < T_G[0];
    fgSlots[1].g.visible = tau8 >= T_S[1] && tau8 < T_G[1];

    // ---- caminhão de expedição: chega (2,2–3,0), recebe 2 paletes, sai (6,6–7,4) ----
    let oz = TO.z,
      ovis = true;
    if (tau8 >= 6.6 && tau8 < 7.4) oz = TO.z + 62 * Math.pow((tau8 - 6.6) / 0.8, 2);
    else if (tau8 >= 7.4 || tau8 < 2.2) ovis = false;
    else if (tau8 < 3.0) oz = TO.z - 46 * Math.pow(1 - (tau8 - 2.2) / 0.8, 2);
    trk.visible = ovis;
    trk.position.set(TO.x, 0, oz);
    onTruck[0].g.visible = ovis && tau8 >= T_D[0];
    onTruck[1].g.visible = ovis && tau8 >= T_D[1];

    // ---- caminhão de chapas: chega carregado (3,2–4,0) e sai vazio (7,5–8,3) ----
    const ti = (tau8 - 7.5 + 8) % 8; // 0 = começa a sair
    let iz = TI.z,
      ivis = true;
    if (ti < 0.8) iz = TI.z + 62 * Math.pow(ti / 0.8, 2);
    else if (ti < 3.7) ivis = false;
    else if (ti < 4.5) iz = TI.z - 30 * Math.pow(1 - (ti - 3.7) / 0.8, 2);
    trkIn.visible = ivis;
    trkIn.position.set(TI.x, 0, iz);
    truckBundle.visible = tau8 >= 3.2 && tau8 < T_GRAB;
    // portões: o de trás abre para as duas chegadas; o da frente, para as duas saídas
    doorsB.back.setOpen(pulse(tau8, 1.95, 2.2, 4.0, 4.3));
    doorsB.front.setOpen(pulse((tau8 + 2) % 8, 0.35, 0.6, 2.45, 2.7));

    // ---- empilhadeira de insumos: caminhão → estante de chapas → laser ----
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
  // corredor de caminhões: descarga atrás, carga na frente
  x.fillStyle = 'rgba(70,74,78,0.5)';
  x.fillRect(LANE.x - LANE.w / 2, B.z0, LANE.w, B.z1 - B.z0);
  x.fillStyle = yellow;
  for (const sx of [-1, 1]) x.fillRect(LANE.x + (sx * LANE.w) / 2 - 0.07, B.z0, 0.14, B.z1 - B.z0);
  x.fillStyle = white;
  for (let z = B.z0 + 1; z < B.z1; z += 3) x.fillRect(LANE.x - 0.06, z, 0.12, 1.5);
  hatch(LANE.x + LANE.w / 2 + 0.1, -11.2, LANE.x + LANE.w / 2 + 1.0, -6.8); // descarga
  hatch(LANE.x + LANE.w / 2 + 0.1, 6.8, LANE.x + LANE.w / 2 + 1.0, 10.4); // carga
  // corredor de empilhadeira em frente às estantes de insumos (parede dos fundos)
  x.fillStyle = 'rgba(86,90,95,0.42)';
  x.fillRect(-36.4, -13.45, 45.2, 2.5);
  x.fillStyle = yellow;
  x.fillRect(-36.4, -13.5, 45.2, 0.09);
  x.fillRect(-36.4, -10.99, 45.2, 0.09);
  // faixas de pedestre
  const walk = (x0, z0, x1, z1) => {
    x.fillStyle = green;
    x.fillRect(x0, z0, x1 - x0, z1 - z0);
    rect(x0, z0, x1, z1, yellow, 0.08);
  };
  walk(-23.6, 13.6, 28.4, 14.6);
  walk(27.4, -10.4, 28.4, 14.6);
  walk(-23.6, -0.4, -0.6, 0.6);
  // zonas
  const zone = (x0, z0, x1, z1) => rect(x0, z0, x1, z1, yellow, 0.1);
  zone(FG.x0 - 0.4, 1.3, FG.x1 + 0.6, 12.8); // armários embalados
  zone(-32.6, -9.2, -24.2, -5.0); // pórtico de chapas
  zone(-24.0, -9.4, -15.8, -5.2); // laser
  zone(-19.9, -5.9, -10.6, -3.9); // trilho dos robôs
  zone(-15.8, -8.3, -14.2, -5.7); // mesa de recortes
  zone(-14.6, -9.9, -10.0, -6.0); // dobradeira
  zone(-12.6, -3.6, -6.6, -0.7); // solda dos conjuntos
  zone(-7.4, -10.3, -0.6, -3.2); // solda da carcaça
  zone(1.0, -9.6, 27.6, -5.0); // pintura (fileira de trás)
  zone(23.6, -5.0, 28.0, 4.0); // estufa
  zone(1.6, 3.2, 23.0, 6.0); // resfriamento
  zone(-18.6, 6.2, 9.2, 12.4); // montagem
  zone(-23.0, 7.4, -18.8, 13.2); // paletização
  zone(PARTS.x0 - 0.5, 7.4, PARTS.x1 + 0.5, 13.0); // peças acabadas
  hatch(-23.0, 8.6, -22.0, 10.6);
  // vagas das empilhadeiras
  rect(-35.4, -11.7, -33.4, -10.1, white, 0.08);
  rect(-24.7, 11.3, -23.1, 13.3, white, 0.08);
  rect(27.6, 8.6, 29.6, 10.2, white, 0.08);
  // numeração dos postos
  x.fillStyle = 'rgba(255,255,255,0.92)';
  x.textBaseline = 'middle';
  const label = (n, name, px, pz, size = 1.1) => {
    x.font = `700 ${size}px Barlow, Arial, sans-serif`;
    x.fillText(n, px, pz);
    x.font = `600 ${size * 0.36}px Barlow, Arial, sans-serif`;
    x.fillText(name, px + size * 1.25, pz + size * 0.06);
  };
  label('01', 'INSUMOS', -34.6, -9.9, 0.9);
  label('02', 'LASER', -23.8, -4.4);
  label('03', 'DOBRA', -16.8, -2.9);
  label('04', 'SOLDA', -6.4, -2.4);
  label('05', 'PINTURA', 3.0, -4.2);
  label('06', 'MONTAGEM', 1.6, 12.95, 0.8);
  label('07', 'TESTE', -10.8, 12.95, 0.8);
  label('08', 'EMBALAGEM', -15.2, 12.95, 0.8);
  label('09', 'EXPEDIÇÃO', -34.8, 0.6, 0.9);
  label('', 'ESTOQUE DE PEÇAS ACABADAS', 10.6, 13.25, 0.8);
}
