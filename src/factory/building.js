// Galpão: piso com demarcações, paredes (só a face interna, para ver por fora), estrutura do telhado,
// luminárias, portões e o pátio externo.
import * as THREE from 'three';
import { M, box, rbox, cyl, beam, bake, shadows, panel, floorTexture, asphaltTexture, wallTexture, ribbedTexture, signTexture } from './kit.js';
import { B, LANE } from './layout.js';

export function buildBuilding(scene, paintFloor) {
  const root = new THREE.Group();
  root.name = 'building';
  const W = B.x1 - B.x0,
    Dp = B.z1 - B.z0,
    cx = (B.x0 + B.x1) / 2;

  // ---------- piso ----------
  const fmap = floorTexture({ x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1 }, paintFloor, 64);
  const rough = M.detail.clone();
  rough.repeat.set(W / 2.5, Dp / 2.5);
  rough.needsUpdate = true;
  const floorMat = new THREE.MeshPhysicalMaterial({
    map: fmap,
    roughness: 0.5,
    roughnessMap: rough,
    metalness: 0.0,
    bumpMap: rough,
    bumpScale: 0.35,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.9,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // pátio externo
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(260, 200), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92, metalness: 0 }));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(cx, -0.03, 10);
  yard.receiveShadow = true;
  scene.add(yard);

  // ---------- paredes ----------
  const wtex = wallTexture();
  const wallMat = (len) => {
    const t = wtex.clone();
    t.repeat.set(len / 4, 1);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.62, metalness: 0.1 });
  };
  const lintelMat = new THREE.MeshStandardMaterial({ map: ribbedTexture('#e3e6e9', 0.08), roughness: 0.62, metalness: 0.1 });
  // parede ao longo de X em z = zc, voltada para `face` (+1 = +z). openings: [{ x, w, h }]
  const wallX = (zc, face, openings) => {
    const g = new THREE.Group();
    let x = B.x0;
    const seg = (xa, xb, y0 = 0, mat) => {
      if (xb - xa < 0.01) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa, B.h - y0), mat ?? wallMat(xb - xa));
      m.position.set((xa + xb) / 2, y0 + (B.h - y0) / 2, zc);
      if (face < 0) m.rotation.y = Math.PI;
      m.castShadow = false;
      m.receiveShadow = true;
      g.add(m);
    };
    for (const o of [...openings].sort((a, b) => a.x - b.x)) {
      seg(x, o.x - o.w / 2);
      seg(o.x - o.w / 2, o.x + o.w / 2, o.h, lintelMat);
      x = o.x + o.w / 2;
    }
    seg(x, B.x1);
    return g;
  };
  const wallZ = (xc, face) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Dp, B.h), wallMat(Dp));
    m.position.set(xc, B.h / 2, 0);
    m.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  };
  const laneDoor = { x: LANE.x, w: 5.2, h: 5.2 };
  scene.add(wallX(B.z0, 1, [laneDoor]));
  scene.add(wallX(B.z1, -1, [laneDoor]));
  scene.add(wallZ(B.x0, 1));
  scene.add(wallZ(B.x1, -1));

  // ---------- estrutura ----------
  const colMat = M.blue;
  const colXs = [];
  for (let x = B.x0 + 0.5; x <= B.x1 - 0.4; x += 6) colXs.push(x);
  for (const x of colXs) {
    const skipBack = Math.abs(x - laneDoor.x) < 2.9;
    if (!skipBack) root.add(box(colMat, 0.3, B.h, 0.3, x, 0, B.z0 + 0.2));

    // proteção amarela/preta no pé das colunas
    if (!skipBack) root.add(box(M.hazard, 0.34, 1.1, 0.34, x, 0, B.z0 + 0.2));

  }
  // tesouras do telhado (uma a cada 6 m), instanciadas
  const ridge = 2.0;
  const truss = new THREE.Group();
  const tm = M.light;
  truss.add(beam(tm, [0, B.h, B.z0 + 0.2], [0, B.h, B.z1 - 0.2], 0.16, 0.2));
  truss.add(beam(tm, [0, B.h + 0.1, B.z0 + 0.2], [0, B.h + ridge, 0], 0.16, 0.2));
  truss.add(beam(tm, [0, B.h + 0.1, B.z1 - 0.2], [0, B.h + ridge, 0], 0.16, 0.2));
  const nW = 10;
  for (let i = 1; i < nW; i++) {
    const z = B.z0 + 0.2 + ((Dp - 0.4) * i) / nW;
    const top = B.h + 0.1 + (ridge - 0.1) * (1 - Math.abs(z) / (Dp / 2 - 0.2));
    truss.add(beam(tm, [0, B.h, z], [0, top, z], 0.08));
    const z2 = B.z0 + 0.2 + ((Dp - 0.4) * (i + (z < 0 ? 1 : -1))) / nW;
    const top2 = B.h + 0.1 + (ridge - 0.1) * (1 - Math.abs(z2) / (Dp / 2 - 0.2));
    truss.add(beam(tm, [0, B.h, z], [0, top2, z2], 0.07));
  }
  const tb = bake(truss);
  const trussMesh = tb.children[0];
  const inst = new THREE.InstancedMesh(trussMesh.geometry, tm, colXs.length);
  colXs.forEach((x, i) => inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, 0)));
  inst.castShadow = false;
  inst.receiveShadow = false;
  scene.add(inst);
  // terças
  for (let i = 0; i <= 8; i++) {
    const z = B.z0 + 0.6 + ((Dp - 1.2) * i) / 8;
    const y = B.h + 0.2 + (ridge - 0.1) * (1 - Math.abs(z) / (Dp / 2 - 0.2));
    const p = box(tm, W, 0.1, 0.06, cx, y, z);
    p.userData.noShadow = true;
    root.add(p);
  }

  // telhado: duas águas (face interna) com faixas zenitais
  const roofMat = M.roof;
  const sky = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.6, 1.75) });
  const slopeLen = Math.hypot(Dp / 2, ridge);
  const ang = Math.atan2(ridge, Dp / 2);
  for (const s of [-1, 1]) {
    const holder = new THREE.Group();
    holder.position.set(cx, B.h + 0.32 + ridge / 2, (s * Dp) / 4);
    holder.rotation.x = Math.PI / 2 + s * ang; // normal para baixo
    const r = new THREE.Mesh(new THREE.PlaneGeometry(W, slopeLen), roofMat);
    r.castShadow = false;
    r.receiveShadow = false;
    holder.add(r);
    // zenitais: faixas claras ao longo de X
    for (const off of [-0.2, 0.22]) {
      const sl = new THREE.Mesh(new THREE.PlaneGeometry(W - 4, 1.1), sky);
      sl.position.set(0, off * slopeLen, 0.02);
      sl.castShadow = false;
      holder.add(sl);
    }
    scene.add(holder);
  }

  // ---------- luminárias high-bay ----------
  const lampXs = [];
  for (let x = B.x0 + 3.5; x < B.x1; x += 6) lampXs.push(x);
  const lampZs = [-10.5, -3.5, 3.5, 10.5];
  const nL = lampXs.length * lampZs.length;
  const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.34, 0.16, 20), M.anthracite, nL);
  const glow = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20), M.lamp, nL);
  const rod = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), M.dark, nL);
  let k = 0;
  const mat4 = new THREE.Matrix4();
  for (const x of lampXs)
    for (const z of lampZs) {
      const y = B.h - 1.0;
      body.setMatrixAt(k, mat4.makeTranslation(x, y, z));
      glow.setMatrixAt(k, mat4.makeTranslation(x, y - 0.09, z));
      rod.setMatrixAt(k, mat4.makeTranslation(x, y + 0.58, z));
      k++;
    }
  for (const m of [body, glow, rod]) {
    m.castShadow = false;
    m.receiveShadow = false;
    scene.add(m);
  }

  // ---------- portões de enrolar ----------
  const doorMat = new THREE.MeshStandardMaterial({ map: ribbedTexture('#aab1b8', 0.2), roughness: 0.5, metalness: 0.5 });
  doorMat.map.rotation = Math.PI / 2;
  doorMat.map.repeat.set(1, 6);
  const mkDoor = (o, z, face) => {
    const g = new THREE.Group();
    const leaf = box(doorMat, o.w - 0.1, o.h, 0.06, 0, 0, 0);
    leaf.castShadow = false;
    g.add(leaf);
    g.position.set(o.x, 0, z);
    scene.add(g);
    // guias e caixa do rolo
    root.add(box(M.safety, 0.14, o.h + 0.3, 0.2, o.x - o.w / 2 - 0.02, 0, z + face * 0.1));
    root.add(box(M.safety, 0.14, o.h + 0.3, 0.2, o.x + o.w / 2 + 0.02, 0, z + face * 0.1));
    root.add(box(M.anthracite, o.w + 0.5, 0.5, 0.5, o.x, o.h + 0.1, z + face * 0.26));
    return {
      setOpen(f) {
        leaf.scale.y = Math.max(0.02, 1 - f);
        leaf.position.y = o.h - (o.h * leaf.scale.y) / 2;
      },
    };
  };
  const doors = {
    back: mkDoor(laneDoor, B.z0, 1),
    front: mkDoor(laneDoor, B.z1, -1),
  };
  for (const d of Object.values(doors)) d.setOpen(0);

  // ---------- utilidades na parede dos fundos ----------
  root.add(box(M.galv, 60, 0.08, 0.4, -2.5, 6.4, B.z0 + 0.5)); // eletrocalha
  root.add(cyl(M.blue, 0.05, 60, -2.5, 5.6, B.z0 + 0.32, 'x', 10)); // ar comprimido
  root.add(cyl(M.galv, 0.07, 60, -2.5, 5.9, B.z0 + 0.34, 'x', 10));
  for (const x of [11, 17, 23]) {
    root.add(rbox(M.light, 1.6, 2.1, 0.5, x, 0, B.z0 + 0.62, 0.02)); // painéis elétricos
    root.add(box(M.dark, 0.04, 1.2, 0.02, x - 0.2, 0.5, B.z0 + 0.88));
    root.add(cyl(M.galv, 0.03, 4.3, x, 2.1, B.z0 + 0.5, 'y', 8));
    root.add(cyl(M.red, 0.07, 0.5, x + 3, 1.0, B.z0 + 0.45, 'y', 12)); // extintor
  }

  // letreiro na parede dos fundos
  const sign = panel(signTexture(['LOCKER RESIDENCIAL', 'FÁBRICA 01 · LINHA LR-1020'], { w: 2048, h: 384, size: 150, sub: 62, bg: '#16335f' }), 14, 2.62);
  sign.position.set(-2, 7.4, B.z0 + 0.06);
  root.add(sign);

  shadows(root);
  const baked = bake(root);
  baked.traverse((o) => o.isMesh && (o.castShadow = o.castShadow && true));
  scene.add(baked);

  // céu: cúpula com gradiente
  const skyGeo = new THREE.SphereGeometry(400, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#9fc3ea') }, bottom: { value: new THREE.Color('#eef3f8') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 1.6 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
  });
  const dome = new THREE.Mesh(skyGeo, skyMat);
  dome.userData.noAO = true;
  scene.add(dome);

  return { doors, floor, laneDoor };
}
