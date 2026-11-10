// Recursos compartilhados da fábrica: peças de chapa do CAD (planas, dobráveis e dobradas) e as partes do
// armário pronto (do modelo interativo), fundidas em poucas malhas para poderem ser repetidas na linha.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Locker } from '../locker/Locker.js';
import { createMaterials } from '../locker/materials.js';
import { modelData } from '../cad/package.js';
import { foldedGeometry, instanceMatrix, buildFolded } from '../cad/fold3d.js';
import { nestedRings, SHEET } from '../cad/nest.js';
import { bake, shadows, M } from './kit.js';

export function buildAssets() {
  const cad = modelData('drawer');
  const byId = new Map(cad.parts.map((p) => [p.id, p]));
  const entryOf = (id) => cad.entries.find((e) => e.part.id === id);
  const geoCache = new Map();
  const partGeo = (id) => {
    if (!geoCache.has(id)) geoCache.set(id, foldedGeometry(byId.get(id)));
    return geoCache.get(id);
  };

  // peça dobrada na posição de montagem (referencial do armário, em metros)
  const placed = (id, mat = M.sheet) => {
    const g = new THREE.Group();
    const part = byId.get(id);
    for (const inst of part.inst) {
      const m = new THREE.Mesh(partGeo(id), mat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(instanceMatrix(inst));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    const holder = new THREE.Group();
    g.scale.setScalar(0.001);
    holder.add(g);
    holder.updateMatrixWorld(true);
    holder.userData.box = new THREE.Box3().setFromObject(holder);
    return holder;
  };

  // peça dobrável (para a dobradeira); as abas "para baixo" viram "para cima" (a peça é virada na mesa)
  const foldable = (id) => {
    const src = byId.get(id);
    const part = JSON.parse(JSON.stringify(src));
    let ups = 0,
      downs = 0;
    const count = (f) => (f.flanges ?? []).forEach((c) => ((c.dir ?? 'up') === 'up' ? ups++ : downs++, count(c)));
    count(part);
    if (downs > ups) {
      const flip = (f) => (f.flanges ?? []).forEach((c) => ((c.dir = (c.dir ?? 'up') === 'up' ? 'down' : 'up'), flip(c)));
      flip(part);
    }
    const f = buildFolded(part, M.sheet, { fold: 0 });
    const inner = new THREE.Group();
    inner.rotation.x = -Math.PI / 2; // u → X, v → −Z, n → +Y
    inner.scale.setScalar(0.001);
    inner.add(f.group);
    const holder = new THREE.Group();
    holder.add(inner);
    return { part, holder, ...f };
  };

  // ---- aninhamento da chapa de 2 mm (a que o laser corta na animação) ----
  const nest = cad.nests.find((n) => n.mat === 'crs20').sheets[0];
  const toSheet = ([x, y]) => [x / 1000 - SHEET.w / 2000, SHEET.h / 2000 - y / 1000]; // mm → (X, Z) locais da chapa
  const cutPath = []; // segmentos [x0, z0, x1, z1] na ordem de corte
  for (const it of nest.items) {
    for (const ring of nestedRings(it)) {
      for (let i = 0; i < ring.length; i++) {
        const a = toSheet(ring[i]),
          b = toSheet(ring[(i + 1) % ring.length]);
        cutPath.push([a[0], a[1], b[0], b[1]]);
      }
    }
  }
  // pose de uma peça aninhada no referencial da chapa: { x, z, yaw } do "holder" da peça dobrável
  const nestPose = (id) => {
    const it = nest.items.find((i) => i.part.id === id);
    const { flat } = it;
    const [ox, oy] = flat.origin;
    if (!it.rot) return { x: (-ox + it.x) / 1000 - 1.5, z: 0.75 - (-oy + it.y) / 1000, yaw: 0 };
    return { x: (flat.height + oy + it.x) / 1000 - 1.5, z: 0.75 - (-ox + it.y) / 1000, yaw: Math.PI / 2 };
  };

  // ---- armário pronto: partes fundidas (em metros, origem no centro da base) ----
  const mats = createMaterials();
  const locker = new Locker(mats, { lock: 'solenoid', hopperLock: true });
  locker.root.updateMatrixWorld(true);
  const snap = (...names) => {
    const g = new THREE.Group();
    for (const n of names) {
      const b = shadows(bake(locker.parts[n]));
      g.add(b);
    }
    g.scale.setScalar(0.001);
    const holder = new THREE.Group();
    holder.add(g);
    return holder;
  };
  const proto = {
    base: snap('base'),
    top: snap('top'),
    shell: snap('sideL', 'sideR', 'back', 'frame'),
    mech: snap('mech'),
    doorF: snap('door'),
    doorB: snap('doorBack'),
    hatch: snap('doorElec'),
  };
  const clone = (name) => proto[name].clone(true);
  // tudo de uma parte numa única geometria (para trocar o material: aço cru → pó → curado)
  const single = (...names) => {
    const geos = [];
    for (const n of names) {
      proto[n].updateMatrixWorld(true);
      proto[n].traverse((o) => {
        if (!o.isMesh || o.material.transparent) return;
        geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
      });
    }
    const g = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    return g;
  };
  const complete = () => {
    const g = new THREE.Group();
    for (const n of Object.keys(proto)) g.add(clone(n));
    return g;
  };
  // armário "vivo" para o teste funcional
  const live = new Locker(mats, { lock: 'solenoid', hopperLock: true });
  shadows(live.root);

  return { cad, byId, entryOf, partGeo, placed, foldable, nest, cutPath, nestPose, mats, clone, single, complete, live, proto };
}
