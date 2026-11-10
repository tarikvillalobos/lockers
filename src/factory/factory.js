// Monta a fábrica inteira e devolve o relógio da simulação.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { initMaterials } from './kit.js';
import { TAKT } from './layout.js';
import { buildBuilding } from './building.js';
import { buildAssets } from './assets.js';
import { Particles } from './fx.js';
import { buildFab } from './line.js';
import { buildAsm, paintFloor } from './line2.js';

export function buildFactory(scene) {
  initMaterials();
  const building = buildBuilding(scene, paintFloor);
  const A = buildAssets();
  const sparks = new Particles(700, { size: 0.06, color: [3.4, 2.1, 0.8], gravity: -7, drag: 0.8 });
  const powder = new Particles(500, { size: 0.2, color: [0.5, 0.52, 0.55], gravity: -0.15, drag: 2.2, additive: false, opacity: 0.35 });
  scene.add(sparks.points, powder.points);
  const ctx = {
    scene,
    A,
    building,
    sparks,
    powder,
    updaters: [],
    robots: {},
    takt: TAKT,
    mergeGeos: (g) => mergeGeometries(g, false),
  };
  buildFab(ctx);
  buildAsm(ctx);

  // começa com a linha "quente": o primeiro caminhão já está na doca
  const T0 = TAKT * 8 * 40 + TAKT * 3.5;
  const state = { time: T0, produced: 0, cycle: 0, u: 0, tau8: 0 };
  const c = { u: 0, cycle: 0, dt: 0, time: 0, tau8: 0 };
  function update(dt) {
    state.time += dt;
    const cf = state.time / TAKT;
    c.cycle = Math.floor(cf);
    c.u = cf - c.cycle;
    c.dt = dt;
    c.time = state.time;
    c.tau8 = (((c.cycle % 8) + 8) % 8) + c.u;
    for (const f of ctx.updaters) f(c);
    sparks.update(dt);
    powder.update(dt);
    state.cycle = c.cycle;
    state.u = c.u;
    state.tau8 = c.tau8;
    state.produced = c.cycle - Math.floor(T0 / TAKT);
  }
  update(0);
  return { update, state, ctx };
}
