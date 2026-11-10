import './page.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fmt } from './sheetmetal.js';
import { MATERIALS, GROUPS } from './parts.js';
import { modelData, buildPackage } from './package.js';
import { partDxf } from './dxf.js';
import { drawingSvg } from './drawing.js';
import { buildFolded, foldedGeometry, instanceMatrix } from './fold3d.js';
import { zipBlob, download } from './zip.js';

const $ = (id) => document.getElementById(id);
const br = (v, d = 2) => fmt(v, d).replace('.', ',');

// ---------- cena ----------
const host = $('view3d');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c0c8, 0.5));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(1.4, 2.6, 1.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
key.shadow.radius = 5;
Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.4, bottom: -1.2, near: 0.2, far: 8 });
scene.add(key);
const rim = new THREE.DirectionalLight(0xdfe8ff, 0.6);
rim.position.set(-2, 1.4, -1.6);
scene.add(rim);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function resize() {
  const w = host.clientWidth,
    h = host.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

// ---------- materiais ----------
const steel = new THREE.MeshPhysicalMaterial({ color: '#b9bfc5', metalness: 0.9, roughness: 0.36 });
const galv = new THREE.MeshPhysicalMaterial({ color: '#c3cace', metalness: 0.85, roughness: 0.42 });
const paint = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.6, metalness: 0.15, clearcoat: 0.15, clearcoatRoughness: 0.5 });
const finishMats = { body: paint('#3a4045'), front: paint('#3a4045'), cap: paint('#24282b'), mech: galv };
const groupMats = {
  carcaca: paint('#5fc0c0'),
  base: paint('#b8b66c'),
  tampo: paint('#b8b66c'),
  porta: paint('#e4dbd1'),
  basculante: paint('#f2a15a'),
  mecanismo: paint('#9a9db4'),
};
const edgeMat = new THREE.LineBasicMaterial({ color: 0x14181d, transparent: true, opacity: 0.55 });

// ---------- estado ----------
let data = modelData('drawer');
let current = null; // peça selecionada (null = conjunto)
let root = null;
let folded = null;
let assembly = [];
let playing = null;

function dispose(obj) {
  obj?.traverse((o) => {
    o.geometry?.dispose?.();
  });
  if (obj) scene.remove(obj);
}

function addEdges(mesh) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), edgeMat);
  e.userData.edges = true;
  e.visible = $('tgEdges').checked;
  mesh.add(e);
}

function fit(box, dir = [1.1, 0.75, 1.5]) {
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const d = r / Math.sin((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect) * 0.92;
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(d));
  camera.near = d / 100;
  camera.far = d * 20;
  camera.updateProjectionMatrix();
  controls.minDistance = r * 0.4;
  controls.maxDistance = d * 4;
  controls.update();
}

function matFor(part) {
  if ($('tgColors').checked) return groupMats[part.group];
  if (!current) return finishMats[GROUPS[part.group].color];
  return part.mat.startsWith('gi') ? galv : steel;
}

function showAssembly() {
  dispose(root);
  folded = null;
  assembly = [];
  root = new THREE.Group();
  root.scale.setScalar(0.001);
  const C = new THREE.Vector3(0, 510, 0);
  for (const part of data.parts) {
    const geo = foldedGeometry(part);
    geo.computeBoundingBox();
    for (const inst of part.inst) {
      const mesh = new THREE.Mesh(geo, matFor(part));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      const base = instanceMatrix(inst);
      mesh.matrix.copy(base);
      mesh.userData.part = part;
      addEdges(mesh);
      root.add(mesh);
      const c = geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(base);
      const dir = c.clone().sub(C);
      // portas e ripas saem para a frente/trás; o resto se afasta do centro
      if (part.group === 'porta' || part.group === 'basculante') dir.set(0, dir.y * 0.25, Math.sign(c.z || 1) * 260);
      else if (part.group === 'mecanismo') dir.set(dir.x * 0.6, 520 + dir.y * 0.4, dir.z * 0.3);
      else dir.multiply(new THREE.Vector3(1.5, 0.75, 0.9));
      assembly.push({ mesh, base, dir });
    }
  }
  scene.add(root);
  applyExplode();
  fit(new THREE.Box3(new THREE.Vector3(-0.28, 0, -0.28), new THREE.Vector3(0.28, 1.05, 0.28)), [1.05, 0.55, 1.6]);
}

function applyExplode() {
  const e = Number($('fold').value) / 100;
  for (const a of assembly) {
    a.mesh.matrix.copy(a.base);
    a.mesh.matrix.elements[12] += a.dir.x * e;
    a.mesh.matrix.elements[13] += a.dir.y * e;
    a.mesh.matrix.elements[14] += a.dir.z * e;
  }
}

function showPart(part) {
  dispose(root);
  assembly = [];
  root = new THREE.Group();
  folded = buildFolded(part, matFor(part), { fold: Number($('fold').value) / 100 });
  folded.group.traverse((o) => o.isMesh && addEdges(o));
  // deita a face base na "mesa": u → X, v → −Z, n → +Y
  const holder = new THREE.Group();
  holder.rotation.x = -Math.PI / 2;
  holder.scale.setScalar(0.001);
  holder.add(folded.group);
  root.add(holder);
  scene.add(root);
  // centraliza e apoia no chão considerando a peça dobrada e a planificada
  folded.setFold(1);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  folded.setFold(0);
  root.updateMatrixWorld(true);
  box.union(new THREE.Box3().setFromObject(root));
  folded.setFold(Number($('fold').value) / 100);
  const c = box.getCenter(new THREE.Vector3());
  root.position.set(-c.x, -box.min.y + 0.002, -c.z);
  box.translate(root.position);
  fit(box, [0.9, 0.95, 1.4]);
}

// ---------- painel ----------
function renderTotals() {
  const t = data.totals;
  $('totals').innerHTML = [
    [t.pieces, 'peças de chapa'],
    [t.partNumbers, 'códigos'],
    [br(t.mass, 1) + ' kg', 'de aço por armário'],
    [t.bends, 'dobras'],
    [br(t.cut / 1000, 1) + ' m', 'de corte a laser'],
    [t.sheets, 'chapas 3000 × 1500'],
  ]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`)
    .join('');
}

function renderList() {
  const el = $('partList');
  let html = `<button class="item${current ? '' : ' active'}" data-id=""><span class="code mono">CONJUNTO</span><span class="name">Armário completo</span><span class="qty mono">${data.totals.pieces} pç</span></button>`;
  let grp = null;
  for (const p of data.parts) {
    if (p.group !== grp) {
      grp = p.group;
      html += `<div class="grp">${GROUPS[grp].label}</div>`;
    }
    html += `<button class="item${current?.file === p.file ? ' active' : ''}" data-id="${p.file}"><span class="code mono">${p.file}</span><span class="name">${p.name}</span><span class="qty mono">${p.qty} pç · ${br(p.t, 1)} mm</span></button>`;
  }
  el.innerHTML = html;
}

function renderSheet() {
  const dr = $('drawing'),
    pr = $('props');
  if (!current) {
    dr.innerHTML = '';
    dr.style.display = 'none';
    const rows = data.nests.map((n) => [`${MATERIALS[n.mat].label} ${br(n.t, 1)} mm`, `${n.sheets.length} chapa · ${n.sheets.map((s) => Math.round(s.used * 100) + '%').join(', ')}`]);
    pr.innerHTML =
      [
        ['Modelo', data.model.label],
        ['Medidas', '410 × 380 × 1020 mm'],
        ['Peças de chapa', `${data.totals.pieces} em ${data.totals.partNumbers} códigos`],
        ['Massa de aço', `${br(data.totals.mass, 1)} kg`],
        ...rows,
        ['Processo', 'laser → dobra CNC → solda → pintura a pó'],
      ]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
        .join('') + `<div style="border:0;color:#62666b;line-height:1.4">Selecione uma peça na lista para ver a planificação, as dobras e baixar o DXF.</div>`;
    $('btnDxf').disabled = $('btnSvg').disabled = true;
    return;
  }
  const e = data.entries.find((x) => x.part === current);
  dr.style.display = '';
  dr.innerHTML = drawingSvg(current, e.flat);
  const m = MATERIALS[current.mat];
  pr.innerHTML = [
    ['Material', `${m.label} ${br(m.t, 1)} mm`],
    ['Quantidade', `${current.qty} por armário`],
    ['Planificado', `${br(e.flat.width)} × ${br(e.flat.height)} mm`],
    ['Massa', `${br(e.flat.mass, 2)} kg`],
    ['Dobras', `${e.flat.bends.length}`],
    ['Corte', `${br(e.flat.cutLength / 1000, 2)} m`],
    ['Acabamento', GROUPS[current.group].finish],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
  $('btnDxf').disabled = $('btnSvg').disabled = false;
}

function select(part) {
  cancelPlay();
  current = part;
  $('stCode').textContent = part ? part.file : 'CONJUNTO';
  $('stName').textContent = part ? part.name : 'Armário completo';
  $('foldLabel').textContent = part ? 'Dobra' : 'Vista explodida';
  $('fold').value = part ? 100 : 0;
  $('foldVal').textContent = part ? '100%' : '0%';
  $('btnPlay').style.display = part && data.entries.find((x) => x.part === part).flat.bends.length ? '' : 'none';
  if (part) showPart(part);
  else showAssembly();
  renderList();
  renderSheet();
}

function cancelPlay() {
  playing = null;
  $('btnPlay').textContent = 'Animar dobra';
}

// ---------- eventos ----------
$('partList').addEventListener('click', (ev) => {
  const b = ev.target.closest('.item');
  if (!b) return;
  select(data.parts.find((p) => p.file === b.dataset.id) ?? null);
});
$('modelSeg').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  for (const x of $('modelSeg').children) x.classList.toggle('active', x === b);
  const keep = current?.id;
  data = modelData(b.dataset.model);
  renderTotals();
  select(data.parts.find((p) => p.id === keep) ?? null);
});
$('fold').addEventListener('input', () => {
  cancelPlay();
  const f = Number($('fold').value) / 100;
  $('foldVal').textContent = Math.round(f * 100) + '%';
  if (folded) folded.setFold(f);
  else applyExplode();
});
$('btnPlay').addEventListener('click', () => {
  if (!folded) return;
  if (playing) return cancelPlay();
  folded.setFold(0);
  playing = { t: 0 };
  $('btnPlay').textContent = 'Parar';
});
$('tgEdges').addEventListener('change', () => root?.traverse((o) => o.userData.edges && (o.visible = $('tgEdges').checked)));
$('tgColors').addEventListener('change', () => root?.traverse((o) => o.isMesh && (o.material = matFor(o.userData.part ?? current))));
$('drawing').addEventListener('click', () => $('drawing').classList.toggle('zoom'));
$('btnDxf').addEventListener('click', () => {
  const e = data.entries.find((x) => x.part === current);
  download(`${current.file}.dxf`, partDxf(current, e.flat), 'application/dxf');
});
$('btnSvg').addEventListener('click', () => {
  const e = data.entries.find((x) => x.part === current);
  download(`${current.file}.svg`, drawingSvg(current, e.flat), 'image/svg+xml');
});
$('btnZip').addEventListener('click', () => download('locker-lr1020-fabricacao.zip', zipBlob(buildPackage().files)));

// ---------- laço ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (playing && folded) {
    // uma dobra por vez, na ordem da dobradeira
    playing.t += dt;
    const per = 0.7;
    const steps = folded.steps;
    steps.forEach((s, i) => {
      const f = THREE.MathUtils.clamp((playing.t - 0.3 - i * per) / (per * 0.8), 0, 1);
      folded.setBend(s.bend, f * f * (3 - 2 * f));
    });
    const total = Math.min(1, Math.max(0, (playing.t - 0.3) / (steps.length * per)));
    $('fold').value = Math.round(total * 100);
    $('foldVal').textContent = Math.round(total * 100) + '%';
    if (playing.t > 0.3 + steps.length * per + 0.2) cancelPlay();
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
renderTotals();
select(null);
frame();
window.__cad = { get data() { return data; }, select, scene, camera };
