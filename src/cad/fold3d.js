// Geometria 3D das peças de chapa: cada face é uma extrusão da espessura e cada dobra é um nó que gira em
// torno da linha de dobra. `fold` (0 = planificada, 1 = dobrada) permite animar a dobra.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { edgeSegment, holeRing, bendSequence } from './sheetmetal.js';

const DEG = Math.PI / 180;

function faceShape(face) {
  const outline = face.outline ?? [[0, 0], [face.w, 0], [face.w, face.h], [0, face.h]];
  const shape = new THREE.Shape();
  outline.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
  shape.closePath();
  for (const hd of face.holes ?? []) {
    const path = new THREE.Path();
    if (hd.type === 'circle') path.absarc(hd.u, hd.v, hd.d / 2, 0, Math.PI * 2, true);
    else holeRing(hd).forEach(([u, v], i) => (i ? path.lineTo(u, v) : path.moveTo(u, v)));
    shape.holes.push(path);
  }
  return shape;
}

// Monta a peça dobrável. Retorna { group, bends, setFold, setBend }.
export function buildFolded(part, material, { fold = 1, shadows = true } = {}) {
  const t = part.t;
  const bends = [];
  const build = (face, m, path) => {
    const g = new THREE.Group();
    const geo = new THREE.ExtrudeGeometry(faceShape(face), { depth: t, bevelEnabled: false, curveSegments: 10 });
    const a = m > 0 ? 0 : -t;
    geo.translate(0, 0, a);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = mesh.receiveShadow = shadows;
    g.add(mesh);
    (face.flanges ?? []).forEach((fl, i) => {
      const [p0, p1] = edgeSegment(face, fl);
      fl.w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      fl.h = fl.len;
      const up = (fl.dir ?? 'up') === 'up';
      const hinge = new THREE.Group();
      hinge.position.set(p0[0], p0[1], up ? a : a + t);
      hinge.rotation.z = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      const node = new THREE.Group();
      hinge.add(node);
      const child = build(fl, up ? 1 : -1, [...path, i]);
      node.add(child);
      g.add(hinge);
      bends.push({ node, angle: (up ? 1 : -1) * (fl.angle ?? 90) * DEG, path: [...path, i], f: 1 });
    });
    return g;
  };
  const group = build(part, 1, []);
  const setBend = (i, f) => {
    bends[i].f = f;
    bends[i].node.rotation.x = bends[i].angle * f;
  };
  const setFold = (f) => bends.forEach((_, i) => setBend(i, f));
  setFold(fold);
  // passos da dobradeira → índice do nó de dobra
  const steps = bendSequence(part).map((s) => ({ ...s, bend: bends.findIndex((b) => b.path.join() === s.path.join()) }));
  return { group, bends, steps, setFold, setBend };
}

const vec = (a) => (Array.isArray(a) ? new THREE.Vector3(...a) : a);

// Matriz que leva o referencial da face (u, v, n) para o referencial do armário (mm)
export function instanceMatrix(inst) {
  const u = vec(inst.u).clone().normalize(),
    v = vec(inst.v).clone().normalize();
  const n = new THREE.Vector3().crossVectors(u, v);
  const m = new THREE.Matrix4().makeBasis(u, v, n).setPosition(vec(inst.o));
  if (inst.frame) {
    const f = new THREE.Matrix4().makeTranslation(...inst.frame.o);
    if (inst.frame.ry) f.multiply(new THREE.Matrix4().makeRotationY(inst.frame.ry * DEG));
    if (inst.frame.rx) f.multiply(new THREE.Matrix4().makeRotationX(inst.frame.rx * DEG));
    m.premultiply(f);
  }
  return m;
}

// Geometria única da peça dobrada, no referencial da face base
export function foldedGeometry(part) {
  const { group } = buildFolded(part, null, { fold: 1 });
  group.updateMatrixWorld(true);
  const geos = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    g.clearGroups();
    geos.push(g);
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  group.traverse((o) => o.geometry?.dispose());
  return merged;
}

// Geometria plana (antes da dobra), no referencial da planificação, com a espessura em +z
export function flatGeometry(flat, t) {
  const shapes = flat.outer.map((ring) => {
    const s = new THREE.Shape();
    ring.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return s;
  });
  const inside = (p, ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i],
        [xj, yj] = ring[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const owner = (p) => Math.max(0, flat.outer.findIndex((r) => inside(p, r)));
  for (const ring of flat.inner) {
    const h = new THREE.Path();
    ring.forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y)));
    shapes[owner(ring[0])].holes.push(h);
  }
  for (const c of flat.circles) {
    const h = new THREE.Path();
    h.absarc(c.c[0], c.c[1], c.d / 2, 0, Math.PI * 2, true);
    shapes[owner(c.c)].holes.push(h);
  }
  return new THREE.ExtrudeGeometry(shapes, { depth: t, bevelEnabled: false, curveSegments: 8 });
}
