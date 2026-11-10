// Linha de produção, parte 1: estoque de chapas → laser → dobra → solda → pintura.
// Tudo é função do tempo: cada estação repete o mesmo ciclo a cada TAKT segundos (u = fração do ciclo).
import * as THREE from 'three';
import { M, box, cyl, lerp, seg, lin, pulse, smooth, shadows, clamp01 } from './kit.js';
import { POS, ROW_A, B, paintPath } from './layout.js';
import { Robot, evalTrack, vacuumTool, torchTool, gripperTool } from './robot.js';
import * as EQ from './equipment.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _t = {};

// interpolação suave entre chaves escalares [[u, v], ...] (fora do intervalo, mantém o extremo)
export function kf(u, pts) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], smooth((u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])));
  }
  return pts[pts.length - 1][1];
}

export function buildFab(ctx) {
  const { scene, A, sparks, updaters, robots } = ctx;
  const add = (o) => (scene.add(o), o);

  // =====================================================================================
  // 1. Estoque de chapas + pórtico de carga + laser
  // =====================================================================================
  const stack = EQ.sheetStack();
  stack.group.rotation.y = Math.PI / 2;
  stack.group.position.set(POS.stack.x, 0, ROW_A);
  add(stack.group);
  const loader = EQ.gantryLoader(POS.stack.x - 1.4, POS.laser.load + 1.2);
  loader.group.position.z = ROW_A;
  add(loader.group);
  const sheetGeo = new THREE.BoxGeometry(3.0, 0.002, 1.5);
  const mkSheet = () => {
    const m = new THREE.Mesh(sheetGeo, M.sheet);
    m.castShadow = m.receiveShadow = true;
    return add(m);
  };
  const heldSheet = mkSheet();

  const LZ = POS.laser;
  const laser = EQ.laserMachine();
  laser.group.position.set(LZ.cut, 0, LZ.z);
  add(laser.group);
  for (const x of [LZ.load, LZ.unload]) {
    const t = EQ.laserTable();
    t.position.set(x, 0, LZ.z);
    add(t);
  }
  const HI = 0.77,
    LO = 0.4;
  const SHEET_Y = HI + 0.072 + 0.001; // centro da chapa sobre a grelha
  const slot = () => {
    const pallet = add(EQ.laserPallet());
    const sheet = mkSheet();
    return { pallet, sheet };
  };
  const sLoad = slot(),
    sCut = slot(),
    sUnl = slot();
  // linhas de corte (duas vistas da mesma geometria: em corte e já cortada)
  const N = A.cutPath.length;
  const posArr = new Float32Array(N * 6);
  A.cutPath.forEach(([x0, z0, x1, z1], i) => posArr.set([x0, 0, z0, x1, 0, z1], i * 6));
  const attr = new THREE.BufferAttribute(posArr, 3);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x08090a });
  const mkLines = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', attr);
    const l = new THREE.LineSegments(g, lineMat);
    l.frustumCulled = false;
    return add(l);
  };
  const cutLines = mkLines(),
    doneLines = mkLines();
  const cutGlow = new THREE.PointLight(0xffc27a, 0, 5, 1.8);
  add(cutGlow);

  // =====================================================================================
  // 2. Triagem dos recortes + robô da dobradeira (os dois no mesmo trilho) + transportador
  // =====================================================================================
  const rail = EQ.robotRail(POS.rail.x1 - POS.rail.x0);
  rail.position.set((POS.rail.x0 + POS.rail.x1) / 2, 0, POS.rail.z);
  add(rail);
  const carriage = add(EQ.railCarriage());
  const carriage2 = add(EQ.railCarriage());
  const r1 = (robots.r1 = new Robot({ scale: 1.15, tool: vacuumTool(0.26, 0.13, 3, 2) }));
  const r2 = (robots.r2 = new Robot({ scale: 1.15, tool: vacuumTool(0.34, 0.22, 3, 2) }));
  add(r1.group);
  add(r2.group);
  const brake = EQ.pressBrake();
  brake.group.position.set(POS.brake.x, 0, POS.brake.z);
  add(brake.group);
  const C1 = POS.conv1;
  const conv = EQ.rollerConveyor(C1.x1 - C1.x0, 1.1, C1.h);
  conv.position.set(C1.x0, 0, C1.z);
  add(conv);
  const tower = EQ.bufferTower();
  tower.position.set(C1.x1 + 0.1, 0, C1.z);
  add(tower);
  const TB = POS.table;
  const table = EQ.blankTable(1.3, 2.3, TB.h);
  table.position.set(TB.x, 0, TB.z);
  add(table);
  // pilha de recortes já separados (zona de triagem)
  {
    const pile = new THREE.Group();
    [[1.0, 0.44], [0.54, 0.42], [0.45, 0.42], [0.4, 0.4], [0.4, 0.22]].forEach(([w, d], i) => {
      for (let k = 0; k < 3; k++) pile.add(box(M.sheet, w, 0.002, d, (i % 2 ? 0.12 : -0.1) * (i > 0 ? 1 : 0), i * 0.0075 + k * 0.0024, (i % 3) * 0.05 - 0.05));
    });
    pile.position.set(TB.x, TB.h + 0.001, TB.zSort);
    add(shadows(pile));
  }

  const rotY = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
  const up = (p, d) => [p[0], p[1] + d, p[2]];

  // ---- triagem: o robô 2 tira dois recortes por ciclo da chapa cortada e empilha na mesa ----
  const sortItems = A.nest.items.map((it) => {
    const nb = A.nestBlank(it);
    add(nb.holder);
    nb.holder.visible = false;
    const shape = new THREE.Shape();
    const ring = it.flat.outer[0].map(([px, py]) => {
      const [sx, sy] = it.rot ? [it.flat.height - py + it.x, px + it.y] : [px + it.x, py + it.y];
      return [sx / 1000 - 1.5, 0.75 - sy / 1000];
    });
    ring.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const hole = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0x0c0d0e }));
    hole.rotation.x = -Math.PI / 2;
    hole.visible = false;
    add(hole);
    return { ...nb, hole, t: it.part.t / 1000 };
  });
  const SORT_T = [[0.2, 0.34], [0.42, 0.55]]; // [pega, solta] de cada recorte no ciclo
  const home2 = [-17.6, 2.2, POS.rail.z - 1.3];
  const sortKeys = new Map();
  const sortPlan = (cycle) => {
    const n = sortItems.length;
    const key = ((cycle % n) + n) % n;
    if (sortKeys.has(key)) return sortKeys.get(key);
    const ids = [(2 * key) % n, (2 * key + 1) % n];
    const keys = [{ u: 0, p: home2 }];
    const baseX = [[0, -17.6]];
    const cl = (x) => Math.min(-16.4, Math.max(POS.rail.x0 + 0.6, x));
    ids.forEach((id, j) => {
      const it = sortItems[id];
      const pk = [LZ.unload + it.center.x, SHEET_Y + 0.001 + it.t, LZ.z + it.center.z];
      const pl = [TB.x, TB.h + 0.045 + j * 0.004, TB.zSort];
      const [t0, t1] = SORT_T[j];
      keys.push({ u: t0 - 0.045, p: up(pk, 0.3), yaw: it.pose.yaw }, { u: t0, p: pk, yaw: it.pose.yaw }, { u: t0 + 0.035, p: up(pk, 0.45), yaw: it.pose.yaw }, { u: t1, p: pl, yaw: 0, lift: 0.3 }, { u: t1 + 0.03, p: up(pl, 0.4), yaw: 0 });
      baseX.push([t0 - 0.06, cl(pk[0])], [t0 + 0.035, cl(pk[0])], [t1 - 0.03, -16.4], [t1 + 0.005, -16.4]);
    });
    keys.push({ u: 0.7, p: home2 }, { u: 0.999, p: home2 });
    baseX.push([0.72, -17.6], [1, -17.6]);
    const plan = { ids, keys, baseX };
    sortKeys.set(key, plan);
    return plan;
  };

  // ---- dobra: todas as peças dobradas do armário, uma por ciclo, na ordem do kit ----
  const showIds = ['LR-010', 'LR-011', 'LR-020', 'LR-021', 'LR-041', 'LR-022', 'LR-023', 'LR-024', 'LR-001', 'LR-002', 'LR-030', 'LR-040', 'LR-031', 'LR-050', 'LR-042', 'LR-060', 'LR-062'].filter((id) => A.byId.has(id));
  const DIE = { x: POS.brake.x, y: POS.brake.h + 0.001, z: POS.brake.die };
  const TH = (flip) => (flip ? Math.PI / 2 : -Math.PI / 2); // giro da peça: abas para cima ou peça virada
  const shows = showIds.map((id) => {
    const fo = A.foldable(id);
    add(fo.holder);
    fo.holder.visible = false;
    fo.holder.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    const part = fo.part;
    const t = part.t / 1000,
      tz = t / 2;
    const cu = part.w / 2000,
      cv = part.h / 2000;
    // centro da face base no referencial do holder, com a peça girada th em torno do eixo u
    const cOff = (th, yaw) => {
      const y = cv * Math.cos(th) - tz * Math.sin(th),
        z = cv * Math.sin(th) + tz * Math.cos(th);
      const [dx, dz] = rotY(cu, z, yaw);
      return [dx, y, dz];
    };
    // holder a partir do TCP (TCP = centro da peça, na face de cima)
    const holderOf = (tcp, yaw, th) => {
      const c = cOff(th, yaw);
      return [tcp.x - c[0], tcp.y - tz - c[1], tcp.z - c[2]];
    };
    const pickTcp = [TB.x, TB.h + t + 0.001, TB.zPick];
    const steps = fo.steps.map((s) => {
      const flip = s.dir === 'down' ? 1 : 0;
      const sg = flip ? 1 : -1;
      const yaw = Math.atan2(s.out[0], -sg * s.out[1]);
      const [dx, dz] = rotY(s.mid[0] / 1000, (sg * s.mid[1]) / 1000, yaw);
      const h = [DIE.x - dx, DIE.y + (flip ? t : 0), DIE.z - dz];
      const c = cOff(TH(flip), yaw);
      return { ...s, flip, yaw, tcp: [h[0] + c[0], h[1] + c[1] + tz, h[2] + c[2]] };
    });
    const lastFlip = steps.length ? steps[steps.length - 1].flip : 0;
    const dropTcp = [C1.x0 + 0.75, C1.h + t + 0.002, C1.z];
    const done = new THREE.Group();
    const dInner = new THREE.Group();
    dInner.rotation.x = TH(lastFlip);
    dInner.scale.setScalar(0.001);
    const dm = new THREE.Mesh(A.partGeo(id), part.mat.startsWith('gi') ? M.galv : M.sheet);
    dm.castShadow = dm.receiveShadow = true;
    dInner.add(dm);
    done.add(dInner);
    done.visible = false;
    add(done);
    const dh = holderOf({ x: dropTcp[0], y: dropTcp[1], z: dropTcp[2] }, Math.PI / 2, TH(lastFlip));
    done.rotation.y = Math.PI / 2;
    return { id, fo, part, steps, pickTcp, dropTcp, lastFlip, done, dh, t, holderOf };
  });
  // trilha do TCP do robô para cada peça (a última chave já aponta para a peça seguinte)
  const W0 = 0.3,
    W1 = 0.84;
  shows.forEach((s, k) => {
    const next = shows[(k + 1) % shows.length];
    const n = Math.max(1, s.steps.length);
    const dU = Math.min(0.135, (W1 - W0) / n);
    const keys = [
      { u: 0.0, p: up(s.pickTcp, 0.5), yaw: 0 },
      { u: 0.165, p: up(s.pickTcp, 0.2), yaw: 0 },
      { u: 0.2, p: s.pickTcp, yaw: 0 },
      { u: 0.235, p: up(s.pickTcp, 0.4), yaw: 0 },
    ];
    const flips = [[0, 0], [0.235, 0]];
    let prevFlip = 0;
    s.steps.forEach((st, i) => {
      const a = W0 + i * dU;
      const arrive = a + (i === 0 ? 0 : 0.36 * dU);
      keys.push({ u: arrive, p: st.tcp, yaw: st.yaw, lift: st.flip !== prevFlip ? 0.42 : i === 0 ? 0.2 : 0.12 });
      keys.push({ u: a + 0.98 * dU, p: st.tcp, yaw: st.yaw });
      if (st.flip !== prevFlip) flips.push([i === 0 ? 0.245 : a + 0.04 * dU, prevFlip], [arrive - 0.012, st.flip]);
      prevFlip = st.flip;
      st.a = a;
    });
    const end = W0 + n * dU;
    keys.push({ u: Math.max(0.9, end + 0.05) - 0.0, p: up(s.dropTcp, 0.3), yaw: Math.PI / 2, lift: 0.25 });
    keys.push({ u: 0.925, p: s.dropTcp, yaw: Math.PI / 2 });
    keys.push({ u: 0.955, p: up(s.dropTcp, 0.4), yaw: Math.PI / 2 });
    keys.push({ u: 0.9999, p: up(next.pickTcp, 0.5), yaw: 0 });
    flips.push([1, prevFlip]);
    s.keys = keys;
    s.flips = flips;
    s.dU = dU;
    const xp = TB.x + 0.6;
    s.baseX = [[0, xp], [0.22, xp], [0.3, DIE.x], [0.85, DIE.x], [0.91, POS.rail.x1 - 0.6], [0.955, POS.rail.x1 - 0.6], [1, xp]];
  });

  // =====================================================================================
  // 3. Célula de solda
  // =====================================================================================
  const FX = POS.fixture;
  const fixture = EQ.weldFixture(FX.h);
  fixture.position.set(FX.x, 0, FX.z);
  add(fixture);
  const asmO = V(FX.x, FX.h - 0.02, FX.z);
  const weldIds = [['LR-011'], ['LR-010'], ['LR-020'], ['LR-021', 'LR-041'], ['LR-022'], ['LR-023'], ['LR-024']];
  const WA = (k) => 0.05 + k * 0.108;
  const weldParts = weldIds.map((ids, k) => {
    const g = new THREE.Group();
    const bb = new THREE.Box3();
    for (const id of ids) {
      const h = A.placed(id);
      bb.union(h.userData.box);
      g.add(h);
    }
    add(g);
    const top = V((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
    const place = asmO.clone().add(top);
    const pick = V(POS.pick.x, C1.h + 0.03 + (bb.max.y - bb.min.y), POS.pick.z);
    return { g, top, place, pick, a: WA(k) };
  });
  const r3 = (robots.r3 = new Robot({ scale: 1.15, tool: gripperTool(0.1) }).place(POS.r3.x, POS.r3.z, Math.PI));
  add(r3.group);
  const home3 = [POS.r3.x - 0.4, 2.1, POS.r3.z - 1.5];
  const k3 = [{ u: 0.0, p: home3 }];
  for (const w of weldParts) {
    const pk = w.pick.toArray(),
      pl = w.place.toArray();
    k3.push({ u: w.a - 0.014, p: up(pk, 0.22) }, { u: w.a, p: pk }, { u: w.a + 0.02, p: up(pk, 0.35) }, { u: w.a + 0.07, p: pl, lift: 0.3 }, { u: w.a + 0.084, p: up(pl, 0.3) });
  }
  k3.push({ u: 0.86, p: home3 }, { u: 0.999, p: home3 });

  // robôs de solda
  const mkWelder = (name, pos, pts) => {
    const r = (robots[name] = new Robot({ scale: 1.0, tool: torchTool() }).place(pos.x, pos.z, Math.atan2(FX.x - pos.x, FX.z - pos.z)));
    add(r.group);
    const home = [lerp(pos.x, FX.x, 0.45), 1.7, lerp(pos.z, FX.z, 0.45)];
    const yawTo = (p) => Math.atan2(p[0] - pos.x, p[2] - pos.z);
    const keys = [{ u: 0, p: home, yaw: yawTo([FX.x, 0, FX.z]), pitch: 0.7 }];
    const welds = [];
    weldParts.forEach((w, k) => {
      const t0 = w.a + 0.078 + (name === 'r5' ? 0.004 : 0);
      const lp = pts(k);
      const p = [asmO.x + lp[0], asmO.y + lp[1], asmO.z + lp[2]];
      const back = [lerp(p[0], pos.x, 0.18), p[1] + 0.12, lerp(p[2], pos.z, 0.18)];
      keys.push({ u: t0 - 0.012, p: back, yaw: yawTo(p), pitch: 0.55 }, { u: t0, p, yaw: yawTo(p), pitch: 0.55 }, { u: t0 + 0.022, p: [p[0], p[1] + 0.06, p[2]], yaw: yawTo(p), pitch: 0.55 }, { u: t0 + 0.034, p: back, yaw: yawTo(p), pitch: 0.55 });
      welds.push({ t0, t1: t0 + 0.022, p: V(...p) });
    });
    keys.push({ u: 0.9, p: home, yaw: yawTo([FX.x, 0, FX.z]), pitch: 0.7 }, { u: 0.999, p: home, yaw: yawTo([FX.x, 0, FX.z]), pitch: 0.7 });
    const light = new THREE.PointLight(0x9fd0ff, 0, 7, 1.6);
    add(light);
    const src = EQ.weldSource();
    src.position.set(pos.x + (pos.x > FX.x ? 0.9 : -0.9), 0, pos.z - 0.5);
    add(src);
    return { r, keys, welds, light };
  };
  const yk = (k) => 0.14 + 0.118 * k;
  const w4 = mkWelder('r4', POS.r4, (k) => (k % 2 ? [0.207, yk(k), -0.02] : [0.19, yk(k), -0.192]));
  const w5 = mkWelder('r5', POS.r5, (k) => (k % 2 ? [-0.207, yk(k), -0.06] : [-0.19, yk(k), -0.192]));
  const hood = EQ.fumeHood(2.4, 2.2, B.h, 3.5);
  hood.position.set(FX.x, 0, FX.z);
  add(hood);

  // =====================================================================================
  // 4. Pintura: trilho aéreo com 60 ganchos (pares = carcaça, ímpares = rack de portas)
  // =====================================================================================
  const path = paintPath();
  const PP = POS.paint;
  const NH = 60;
  const pitch = path.L / NH;
  const sL = path.sOf.west(-4.6); // ponto de carga da carcaça (lado esquerdo do laço)
  const sOff = sL - 0.24 * pitch; // gancho par passa em sL em u = 0,12
  let sU = sL - 0.24 * pitch + pitch; // descarga: gancho par em u = 0,5
  {
    const want = path.sOf.legB(7.0);
    const m = Math.round((want - sU) / (2 * pitch));
    sU += 2 * pitch * m;
  }
  const U = path.at(sU); // ponto de descarga (fileira da frente)
  const Lp = path.at(sL);
  const dOf = (s) => (((s - sL) % path.L) + path.L) % path.L;
  const spanShell = dOf(sU);
  const sLd = path.sOf.legA(4.4),
    sUd = path.sOf.legB(11.2);
  const dLd = dOf(sLd),
    dUd = dOf(sUd);
  const WASH = { x: 8.5, len: 4.8 },
    DRY = { x: 12.6, len: 2.4 },
    BOOTH = { x: 17.0, len: 5 },
    OVEN = { z: -1.2, len: 7 },
    COOL = { x: 18.4, len: 7.6 },
    CHECK = { x: 13.3 };
  const dA = (x) => dOf(path.sOf.legA(x));
  const dW0 = dA(WASH.x - WASH.len / 2),
    dW1 = dA(WASH.x + WASH.len / 2),
    dD0 = dA(DRY.x - DRY.len / 2),
    dD1 = dA(DRY.x + DRY.len / 2);
  const dB0 = dA(BOOTH.x - 1.3),
    dB1 = dA(BOOTH.x + 1.3);
  const dO0 = dOf(path.sOf.east(OVEN.z - 3.2)),
    dO1 = dOf(path.sOf.east(OVEN.z + 3.2));
  const dC0 = dOf(path.sOf.legB(COOL.x + COOL.len / 2)),
    dC1 = dOf(path.sOf.legB(COOL.x - COOL.len / 2));

  // trilho (segmentos instanciados) + pendurais do teto
  {
    const stepS = 0.3;
    const n = Math.ceil(path.L / stepS);
    const railI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.16, stepS + 0.04), M.safety, n);
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      Yv = V(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const p = path.at((i + 0.5) * (path.L / n));
      m4.compose(V(p.x, PP.rail, p.z), q.setFromAxisAngle(Yv, p.yaw), V(1, 1, 1));
      railI.setMatrixAt(i, m4);
    }
    railI.castShadow = true;
    add(railI);
    const ns = Math.round(path.L / 3.55);
    const drop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, B.h - PP.rail, 6), M.dark, ns);
    const brk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), M.anthracite, ns);
    for (let i = 0; i < ns; i++) {
      const p = path.at((i + 0.5) * (path.L / ns));
      drop.setMatrixAt(i, m4.makeTranslation(p.x, (B.h + PP.rail) / 2 + 0.08, p.z));
      brk.setMatrixAt(i, m4.makeTranslation(p.x, PP.rail + 0.11, p.z));
    }
    add(drop);
    add(brk);
    // motor de tração
    const drv = shadows(new THREE.Group().add(box(M.blue, 0.7, 0.5, 0.5, 0, 0, 0), cyl(M.dark, 0.16, 0.4, 0, 0.25, 0.45, 'z', 16)));
    drv.position.set(PP.x0 + 0.5, PP.rail + 0.2, PP.z0 + 0.5);
    add(drv);
  }
  // ganchos
  const trolley = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.14, 0.26), M.anthracite, NH);
  const rodLen = PP.rail - 0.14 - PP.hook;
  const rod = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, rodLen, 6), M.steel, NH);
  const hookI = new THREE.InstancedMesh(new THREE.TorusGeometry(0.05, 0.01, 6, 14, Math.PI * 1.4), M.steel, NH / 2);
  const rackGeo = new THREE.BoxGeometry(0.04, 0.04, 1.02);
  const rackI = new THREE.InstancedMesh(rackGeo, M.steel, NH / 2);
  for (const m of [trolley, rod, hookI, rackI]) {
    m.castShadow = true;
    m.frustumCulled = false;
    add(m);
  }
  // cargas
  const RAW = new THREE.Color('#b6bcc2'),
    POWDER = new THREE.Color('#5b6167'),
    CURED = new THREE.Color('#3a4045'),
    HOT = new THREE.Color(0.55, 0.15, 0.03);
  // O pó cobre a peça conforme ela passa pelo plano das pistolas (posição no mundo), não de uma vez.
  // uMode: 0 = aço cru, 1 = passando pela cabine (cobre o que já cruzou uPlane), 2 = toda coberta
  const paintMat = () => {
    const m = new THREE.MeshPhysicalMaterial({ color: RAW.clone(), metalness: 0.85, roughness: 0.36, envMapIntensity: 2.4 });
    const un = { uMode: { value: 0 }, uPlane: { value: 0 }, uCure: { value: 0 }, uPowder: { value: POWDER }, uCured: { value: CURED } };
    m.userData.u = un;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, un);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uMode;\nuniform float uPlane;\nuniform float uCure;\nuniform vec3 uPowder;\nuniform vec3 uCured;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat coatK = uMode < 0.5 ? 0.0 : (uMode < 1.5 ? smoothstep(uPlane - 0.2, uPlane + 0.2, vWPos.x) : 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, mix(uPowder, uCured, uCure), coatK);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(0.97, 0.6, uCure), coatK);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, mix(0.0, 0.15, uCure), coatK);');
    };
    m.customProgramCacheKey = () => 'paint-coat';
    return m;
  };
  // d = distância percorrida no trilho desde a carga
  const setPaint = (mat, d) => {
    const un = mat.userData.u;
    // molhada depois da lavagem, seca na estufa de secagem
    const wet = smooth((d - dW0) / 0.8) * (1 - smooth((d - dD0) / (dD1 - dD0)));
    mat.color.copy(RAW).multiplyScalar(1 - 0.2 * wet);
    mat.roughness = lerp(0.36, 0.08, wet);
    un.uMode.value = d < dB0 ? 0 : d <= dB1 ? 1 : 2;
    un.uPlane.value = BOOTH.x;
    const cure = smooth((d - dO0) / (dO1 - dO0));
    un.uCure.value = cure;
    // a peça sai quente da estufa e esfria no túnel de resfriamento
    const heat = smooth((d - dO0) / ((dO1 - dO0) * 0.45)) * (1 - smooth((d - dC0) / (dC1 - dC0)));
    mat.emissive.copy(HOT).multiplyScalar(d > 1e8 ? 0 : heat);
    mat.envMapIntensity = d < dB0 ? 2.4 : 1;
  };
  const shellGeo = A.single('shell');
  ctx.shellGeo = shellGeo;
  // rack de portas: porta da frente, porta de trás e tampa da eletrônica penduradas lado a lado
  const center = (g, dx, dy) => {
    g.computeBoundingBox();
    const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2 + dx, -b.max.y + dy, -(b.min.z + b.max.z) / 2);
    return g;
  };
  const rackParts = [center(A.single('doorF'), 0, -0.06), center(A.single('doorB'), 0, -0.06), center(A.single('hatch'), 0, -0.62)];
  // local: z ao longo do trilho. As portas ficam de lado para as pistolas (largura ao longo de z).
  rackParts[0].rotateY(Math.PI / 2).translate(0, 0, -0.26);
  rackParts[1].rotateY(Math.PI / 2).translate(0, 0, 0.26);
  rackParts[2].rotateY(Math.PI / 2).translate(0, 0, -0.26);
  const doorSetGeo = ctx.mergeGeos(rackParts);
  const payloads = [];
  for (let j = 0; j < NH; j++) {
    const mat = paintMat();
    const mesh = new THREE.Mesh(j % 2 === 0 ? shellGeo : doorSetGeo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.visible = false;
    add(mesh);
    payloads.push({ mesh, mat });
  }
  ctx.paintMat = paintMat;
  ctx.setPaint = setPaint;
  ctx.dEnd = dOf(sU);

  // máquinas da pintura
  const wash = EQ.washTunnel(WASH.len);
  wash.position.set(WASH.x, 0, PP.z0);
  add(wash);
  const dry = EQ.cureOven(DRY.len, { title: 'SECAGEM', sub: '120 °C', bg: '#c2410c', glow: [1.2, 0.5, 0.18], light: 8, full: false });
  dry.group.position.set(DRY.x, 0, PP.z0);
  add(dry.group);
  const booth = EQ.powderBooth(BOOTH.len);
  booth.group.position.set(BOOTH.x, 0, PP.z0);
  add(booth.group);
  const oven = EQ.cureOven(OVEN.len);
  oven.group.position.set(PP.x1, 0, OVEN.z);
  oven.group.rotation.y = -Math.PI / 2;
  add(oven.group);
  const cool = EQ.coolingTunnel(COOL.len);
  cool.position.set(COOL.x, 0, PP.z1);
  add(cool);
  const check = EQ.thicknessCheck();
  check.position.set(CHECK.x, 0, PP.z1);
  add(check);
  const liftIn = EQ.doorLift('CARGA DE PORTAS');
  liftIn.group.position.set(4.4, 0, PP.z0);
  add(liftIn.group);
  const liftOut = EQ.doorLift('DESCARGA DE PORTAS');
  liftOut.group.position.set(11.2, 0, PP.z1);
  add(liftOut.group);
  const liftSetIn = new THREE.Mesh(doorSetGeo, paintMat());
  const liftSetOut = new THREE.Mesh(doorSetGeo, paintMat());
  setPaint(liftSetOut.material, 1e9);
  for (const m of [liftSetIn, liftSetOut]) {
    m.castShadow = true;
    add(m);
  }
  // fases em que um gancho ímpar passa pelas estações de portas
  const phaseOf = (s) => {
    const v = ((s - sOff) / pitch - 1) / 2;
    return v - Math.floor(v);
  };
  const uLd = phaseOf(sLd),
    uUd = phaseOf(sUd);

  // robô de carga da pintura (segura a carcaça pela lateral, com a ferramenta na horizontal)
  const r6 = (robots.r6 = new Robot({ scale: 1.25, tool: vacuumTool(0.3, 0.5, 2, 3) }).place(POS.r6.x, POS.r6.z, Math.PI / 2));
  add(r6.group);
  const GRIP = [0.207, 0.5, 0]; // ponto de pega na lateral direita da carcaça (referencial do armário)
  const gripAt = (o, yaw) => [o[0] + GRIP[0] * Math.cos(yaw), o[1] + GRIP[1], o[2] - GRIP[0] * Math.sin(yaw)];
  const fixO = [asmO.x, asmO.y, asmO.z];
  const hangO = (u) => {
    const p = path.at(sL + (u - 0.12) * 2 * pitch);
    return [p.x, PP.hook - 1.0, p.z];
  };
  const k6 = [
    { u: 0.06, p: (u) => gripAt(hangO(u), Math.PI).map((v, i) => v + [-0.3, -0.12, 0][i]), yaw: Math.PI / 2, pitch: 0 },
    { u: 0.12, p: (u) => gripAt(hangO(u), Math.PI), yaw: Math.PI / 2, pitch: 0 },
    { u: 0.17, p: (u) => gripAt(hangO(0.12), Math.PI).map((v, i) => v + [-0.45, -0.3, 0][i]), yaw: Math.PI / 2, pitch: 0 },
    { u: 0.32, p: [POS.r6.x - 0.3, 1.9, POS.r6.z + 1.9], yaw: 0, pitch: 0.3 },
    { u: 0.78, p: [POS.r6.x - 0.5, 1.7, POS.r6.z + 1.7], yaw: 0, pitch: 0.3 },
    { u: 0.85, p: gripAt(fixO, 0).map((v, i) => v + [0.4, 0.1, 0][i]), yaw: -Math.PI / 2, pitch: 0 },
    { u: 0.88, p: gripAt(fixO, 0), yaw: -Math.PI / 2, pitch: 0 },
    { u: 0.92, p: gripAt(fixO, 0).map((v, i) => v + [0.15, 0.5, 0.2][i]), yaw: -Math.PI / 2, pitch: 0 },
    { u: 0.985, p: [POS.r6.x - 0.2, 2.3, POS.r6.z + 2.1], yaw: 0, pitch: 0 },
  ];
  const carried6 = new THREE.Mesh(shellGeo, paintMat());
  carried6.castShadow = true;
  add(carried6);

  // =====================================================================================
  // atualização por quadro
  // =====================================================================================
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    q2 = new THREE.Quaternion(),
    Yv = V(0, 1, 0),
    one = V(1, 1, 1),
    pv = V(0, 0, 0);
  const dirUp = V(0, 1, 0);

  updaters.push((c) => {
    const { u, cycle, dt, time } = c;
    const tau8 = c.tau8;

    // ---- estoque + pórtico ----
    const cnt = 30 - Math.floor(tau8) - (u > 0.26 ? 1 : 0) + (tau8 >= ctx.sheetDrop ? 8 : 0);
    stack.setCount(cnt);
    const bx = kf(u, [[0, POS.stack.x], [0.34, POS.stack.x], [0.5, LZ.load], [0.66, LZ.load], [0.9, POS.stack.x]]);
    const topY = stack.top + 0.001;
    const ry = kf(u, [[0, 1.9], [0.18, 1.9], [0.26, topY + 0.004], [0.34, 2.0], [0.5, 2.0], [0.58, SHEET_Y + 0.003], [0.66, 1.9]]);
    loader.bridge.position.x = bx;
    loader.ram.position.y = ry;
    const holding = u >= 0.26 && u < 0.58;
    heldSheet.visible = holding;
    if (holding) heldSheet.position.set(bx, ry - 0.001, ROW_A);

    // ---- mesas do laser ----
    const sh = seg(u, 0, 0.1);
    // posto de carga: palete volta por baixo e sobe; a chapa nova chega em u = 0,58
    sLoad.pallet.visible = u >= 0.12;
    const lx = lerp(LZ.cut, LZ.load, seg(u, 0.12, 0.3)),
      ly = lerp(LO, HI, seg(u, 0.3, 0.42));
    sLoad.pallet.position.set(lx, ly, LZ.z);
    sLoad.sheet.visible = u >= 0.58;
    sLoad.sheet.position.set(LZ.load, SHEET_Y, LZ.z);
    // posto de corte
    const cx = lerp(LZ.load, LZ.cut, sh);
    sCut.pallet.position.set(cx, HI, LZ.z);
    sCut.sheet.position.set(cx, SHEET_Y, LZ.z);
    const pc = lin(u, 0.14, 0.86);
    const done = Math.floor(pc * N);
    cutLines.geometry.setDrawRange(0, done * 2);
    cutLines.position.set(cx, SHEET_Y + 0.0016, LZ.z);
    // posto de descarga: recebe a chapa cortada, depois o palete desce e volta por baixo
    const ux = lerp(LZ.cut, LZ.unload, sh) + (LZ.cut - LZ.unload) * seg(u, 0.64, 0.86);
    const uy = lerp(HI, LO, seg(u, 0.56, 0.64));
    const uVis = u < 0.86;
    sUnl.pallet.visible = sUnl.sheet.visible = doneLines.visible = uVis;
    sUnl.pallet.position.set(ux, uy, LZ.z);
    sUnl.sheet.position.set(ux, uy - HI + SHEET_Y, LZ.z);
    doneLines.position.set(ux, uy - HI + SHEET_Y + 0.0016, LZ.z);
    // cabeçote
    let hxL = -1.4,
      hzL = 0;
    const cutting = pc > 0 && pc < 1;
    if (cutting) {
      const i = Math.min(N - 1, done),
        f = pc * N - done;
      const sgm = A.cutPath[i];
      hxL = lerp(sgm[0], sgm[2], f);
      hzL = lerp(sgm[1], sgm[3], f);
      pv.set(LZ.cut + hxL, SHEET_Y + 0.01, LZ.z + hzL);
      sparks.emit(pv, dirUp, 3, { speed: 1.6, spread: 0.9, life: 0.35 });
      cutGlow.position.set(pv.x, pv.y + 0.08, pv.z);
      cutGlow.intensity = 5 + Math.random() * 5;
    } else cutGlow.intensity = 0;
    laser.bridge.position.x = hxL - 0.2;
    laser.head.position.z = hzL;

    // ---- robô 2: triagem dos recortes ----
    const plan = sortPlan(cycle);
    const t2 = evalTrack(plan.keys, u, _t);
    const x2 = kf(u, plan.baseX);
    carriage2.position.set(x2, 0, POS.rail.z);
    r2.group.position.set(x2, 0.26, POS.rail.z);
    r2.group.rotation.y = Math.PI;
    r2.group.updateMatrixWorld(true);
    r2.solve(t2.pos, t2.yaw + Math.PI / 2);
    for (const it of sortItems) {
      it.holder.visible = false;
      it.hole.visible = false;
    }
    plan.ids.forEach((id, j) => {
      const it = sortItems[id];
      const [t0, t1] = SORT_T[j];
      if (uVis && u >= t0) {
        it.hole.visible = true;
        it.hole.position.set(ux, uy - HI + SHEET_Y + 0.0013, LZ.z);
      }
      if (u >= t0 && u < t1) {
        // o recorte segue o TCP (preso pelo centro)
        it.holder.visible = true;
        const dx = it.pose.x - it.center.x,
          dz = it.pose.z - it.center.z;
        const a0 = t2.yaw - it.pose.yaw;
        const [rx, rz] = rotY(dx, dz, a0);
        it.holder.position.set(t2.pos.x + rx, t2.pos.y - it.t, t2.pos.z + rz);
        it.holder.rotation.y = t2.yaw;
      }
    });

    // ---- robô 1 + dobradeira ----
    const k = ((cycle % shows.length) + shows.length) % shows.length;
    const s = shows[k];
    const prev = shows[(k - 1 + shows.length) % shows.length];
    const tr = evalTrack(s.keys, u, _t);
    const xb = kf(u, s.baseX);
    carriage.position.set(xb, 0, POS.rail.z);
    r1.group.position.set(xb, 0.26, POS.rail.z);
    r1.group.rotation.y = Math.PI;
    r1.group.updateMatrixWorld(true);
    r1.solve(tr.pos, tr.yaw + Math.PI / 2);
    for (const o of shows) {
      o.fo.holder.visible = o === s;
      o.done.visible = false;
    }
    // peça em processo: na mesa, no robô (girando se precisar virar) ou já no transportador
    const fl = kf(u, s.flips);
    const th = -Math.PI / 2 + Math.PI * fl;
    s.fo.inner.rotation.x = th;
    if (u < 0.2) {
      const h = s.holderOf({ x: s.pickTcp[0], y: s.pickTcp[1], z: s.pickTcp[2] }, 0, th);
      s.fo.holder.position.set(h[0], h[1], h[2]);
      s.fo.holder.rotation.y = 0;
    } else if (u < 0.925) {
      const h = s.holderOf(tr.pos, tr.yaw, th);
      s.fo.holder.position.set(h[0], h[1], h[2]);
      s.fo.holder.rotation.y = tr.yaw;
    } else {
      s.fo.holder.position.set(s.dh[0], s.dh[1], s.dh[2]);
      s.fo.holder.rotation.y = Math.PI / 2;
    }
    // dobras e avental
    let ramDown = 0;
    s.steps.forEach((st) => {
      const ls = (u - st.a) / s.dU;
      s.fo.setBend(st.bend, u < W0 ? 0 : seg(ls, 0.5, 0.66));
      if (ls >= 0 && ls < 1) ramDown = pulse(ls, 0.4, 0.62, 0.78, 0.96);
    });
    brake.ram.position.y = brake.hd + 0.003 + 0.16 * (1 - ramDown);
    // peça do ciclo anterior seguindo para o pulmão
    if (u < 0.5) {
      prev.done.visible = true;
      prev.done.position.set(prev.dh[0] + seg(u, 0.03, 0.5) * (C1.x1 - C1.x0 + 0.3), prev.dh[1], prev.dh[2]);
    }

    // ---- solda ----
    for (const w of weldParts) {
      const g = w.g;
      if (u < w.a - 0.05 || (u >= 0.88 && true)) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      if (u < w.a) {
        const e = seg(u, w.a - 0.05, w.a - 0.012);
        g.position.set(w.pick.x - w.top.x - 0.55 * (1 - e), w.pick.y - w.top.y, w.pick.z - w.top.z);
      } else if (u < w.a + 0.07) {
        const t3 = evalTrack(k3, u, _t);
        g.position.set(t3.pos.x - w.top.x, t3.pos.y - w.top.y, t3.pos.z - w.top.z);
      } else g.position.copy(asmO);
    }
    const t3 = evalTrack(k3, u, _t);
    r3.solve(t3.pos, 0);
    for (const w of [w4, w5]) {
      const tw = evalTrack(w.keys, u, _t);
      w.r.solve(tw.pos, tw.yaw, tw.pitch);
      let on = null;
      for (const e of w.welds) if (u >= e.t0 && u <= e.t1) on = e;
      if (on) {
        pv.copy(tw.pos);
        sparks.emit(pv, dirUp, 4, { speed: 2.4, spread: 1.0, life: 0.5 });
        w.light.position.set(pv.x, pv.y + 0.1, pv.z);
        w.light.intensity = 14 + Math.random() * 22;
      } else w.light.intensity = 0;
    }

    // ---- robô 6: tira a carcaça do gabarito e pendura no trilho ----
    const t6 = evalTrack(k6, u, _t);
    r6.solve(t6.pos, t6.yaw, t6.pitch);
    const carrying = u >= 0.88 || u < 0.12;
    carried6.visible = carrying;
    if (carrying) {
      // a carcaça gira junto com a ferramenta: yaw da carcaça = yaw da ferramenta + 90°
      const sy = t6.yaw + Math.PI / 2;
      carried6.rotation.y = sy;
      carried6.position.set(t6.pos.x - GRIP[0] * Math.cos(sy), t6.pos.y - GRIP[1], t6.pos.z + GRIP[0] * Math.sin(sy));
    }

    // ---- trilho aéreo ----
    const base = (2 * time) / ctx.takt;
    gunHit[0] = gunHit[1] = false;
    for (let j = 0; j < NH; j++) {
      const sj = (j + base) * pitch + sOff;
      const p = path.at(sj);
      q.setFromAxisAngle(Yv, p.yaw);
      pv.set(p.x, PP.rail - 0.07, p.z);
      trolley.setMatrixAt(j, m4.compose(pv, q, one));
      pv.y = PP.hook + rodLen / 2;
      rod.setMatrixAt(j, m4.compose(pv, q, one));
      pv.y = PP.hook - 0.02;
      if (j % 2 === 0) {
        q2.copy(q).multiply(_qx);
        hookI.setMatrixAt(j / 2, m4.compose(pv, q2, one));
      } else rackI.setMatrixAt((j - 1) / 2, m4.compose(pv, q, one));
      const d = dOf(sj);
      const pl = payloads[j];
      const on = j % 2 === 0 ? d < spanShell : d >= dLd && d < dUd;
      pl.mesh.visible = on;
      if (on) {
        setPaint(pl.mat, d);
        if (d > dB0 - 0.6 && d < dB1 + 0.6) for (let g = 0; g < 2; g++) if (Math.abs(p.x - (BOOTH.x + booth.guns[g].x)) < 0.48) gunHit[g] = true;
        if (j % 2 === 0) {
          pl.mesh.position.set(p.x, PP.hook - 1.0, p.z);
          pl.mesh.rotation.y = p.yaw;
        } else {
          pl.mesh.position.set(p.x, PP.hook - 0.04, p.z);
          pl.mesh.rotation.y = p.yaw;
        }
      }
    }
    trolley.instanceMatrix.needsUpdate = rod.instanceMatrix.needsUpdate = hookI.instanceMatrix.needsUpdate = rackI.instanceMatrix.needsUpdate = true;

    // cabine de pó: os reciprocadores sobem e descem; as pistolas só disparam com peça na frente
    for (let i = 0; i < booth.guns.length; i++) {
      const gn = booth.guns[i];
      const y = 2.25 + 0.5 * Math.sin(time * 2.3 + i * Math.PI);
      gn.car.position.y = y;
      if (!gunHit[i]) continue;
      for (const dy of [-0.32, 0, 0.32]) {
        pv.set(BOOTH.x + gn.x, y + dy, PP.z0 + gn.tipZ);
        ctx.powder.emit(pv, V(0, 0, -gn.side), 2, { speed: 1.5, spread: 0.22, life: 0.8 });
      }
    }
    // lavagem: névoa dos bicos em cada estágio
    for (const sx of wash.userData.stages) {
      for (const sz of [-1, 1]) {
        pv.set(WASH.x + sx + (Math.random() - 0.5) * 0.9, 1.4 + Math.random() * 1.5, PP.z0 + sz * 0.68);
        ctx.water.emit(pv, V(0, -0.15, -sz), 2, { speed: 2.2, spread: 0.18, life: 0.4 });
      }
    }

    // elevadores de portas
    const wrap = (x) => x - Math.round(x);
    const a = wrap(u - uLd); // < 0: subindo antes do gancho chegar
    liftIn.plat.position.y = lerp(0.2, PP.hook - 1.35, pulse(a, -0.3, -0.04, 0.03, 0.2));
    liftSetIn.visible = a > -0.34 && a < 0;
    liftSetIn.position.set(4.4, liftIn.plat.position.y + 1.3, PP.z0);
    liftSetIn.rotation.y = 0;
    const bph = wrap(u - uUd);
    liftOut.plat.position.y = lerp(0.2, PP.hook - 1.35, pulse(bph, -0.2, -0.03, 0.04, 0.3));
    liftSetOut.visible = bph >= 0 && bph < 0.32;
    liftSetOut.position.set(11.2, liftOut.plat.position.y + 1.3, PP.z1);
    liftSetOut.rotation.y = Math.PI;
    void clamp01;
    void dt;
  });

  const gunHit = [false, false];
  const _qx = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
  Object.assign(ctx, { path, pitch, sU, sL, U, Lp, GRIP, gripAt, asmO, BOOTH, WASH, OVEN, COOL, C1 });
}
