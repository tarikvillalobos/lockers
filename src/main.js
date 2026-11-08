import './style.css';
import * as THREE from 'three';
import { setupScene } from './scene/setupScene.js';
import { Locker } from './locker/Locker.js';
import { Parcels } from './locker/Parcels.js';
import { createDimensions } from './locker/Dimensions.js';
import { createMaterials, applyFinish, setXray, FINISHES } from './locker/materials.js';
import { SPEC } from './locker/spec.js';
import { updateTweens, tween } from './core/tween.js';
import { setMuted } from './core/sound.js';

const $ = (id) => document.getElementById(id);

// ---------- cena ----------
const viewport = $('viewport');
const { renderer, labelRenderer, scene, camera, controls } = setupScene(viewport);
const canvas = renderer.domElement;

const mats = createMaterials();
const locker = new Locker(mats);
scene.add(locker.root);
locker.buildEdges(new THREE.LineBasicMaterial({ color: 0x1f2226, transparent: true, opacity: 0.55 }));
locker.setEdges(false);

const parcels = new Parcels(locker);
const dims = createDimensions();
locker.root.add(dims.group);

const baffleRest = locker.baffleAngle;
let xray = false;

// ---------- enquadramento (descontando o painel lateral) ----------
const panel = $('panel');
function updateViewOffset() {
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  const mobile = w <= 760;
  // área livre fica centralizada: renderiza um "recorte" de uma vista virtual maior
  let fullW = w,
    fullH = h,
    ox = 0,
    oy = 0,
    freeW = w,
    freeH = h;
  if (!mobile) {
    const pw = panel.offsetWidth + 16;
    fullW = w + pw;
    ox = pw;
    freeW = w - pw;
  } else {
    const ph = panel.classList.contains('collapsed') ? 44 : panel.offsetHeight;
    const top = 96; // barra superior
    fullH = h + ph - top;
    oy = ph - top;
    freeH = h - ph - top;
  }
  camera.aspect = fullW / fullH;
  // em telas estreitas abre o FOV para o locker caber na largura livre
  const freeAspect = Math.max(0.2, freeW / Math.max(1, freeH));
  const needV = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(11)) / freeAspect) * 180) / Math.PI;
  const fov = Math.min(70, Math.max(32, needV));
  camera.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (fullH / Math.max(1, freeH))) * 180) / Math.PI;
  camera.setViewOffset(fullW, fullH, ox, oy, w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', updateViewOffset);
updateViewOffset();

// ---------- câmera ----------
const VIEWS = {
  persp: { pos: [1.55, 1.25, 2.05], target: [0, 0.52, 0] },
  front: { pos: [0, 0.56, 2.75], target: [0, 0.54, 0] },
  side: { pos: [2.75, 0.56, 0], target: [0, 0.54, 0] },
  top: { pos: [0, 3.1, 0.25], target: [0, 0.5, 0] },
};
function goView(name) {
  const v = VIEWS[name];
  if (!v) return;
  document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  const p0 = camera.position.clone(),
    t0 = controls.target.clone();
  const p1 = new THREE.Vector3(...v.pos),
    t1 = new THREE.Vector3(...v.target);
  tween(0.9, (e) => {
    camera.position.lerpVectors(p0, p1, e);
    controls.target.lerpVectors(t0, t1, e);
  });
}
document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => goView(b.dataset.view)));

// ---------- toast ----------
const toastEl = $('toast');
let toastTimer;
function toast(msg, warn = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('warn', warn);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}
const handle = (res) => {
  if (res?.msg) toast(res.msg, !res.ok);
};

// ---------- ações ----------
const actions = {
  deposit: async () => handle(await parcels.deposit()),
  hopper: () => handle(locker.toggleHopper()),
  lock: async () => handle(await locker.toggleLock()),
  door: () => handle(locker.toggleDoor()),
  retrieveAll: async () => handle(await parcels.retrieveAll()),
};

$('btnDeposit').addEventListener('click', actions.deposit);
$('btnHopper').addEventListener('click', actions.hopper);
$('btnLock').addEventListener('click', actions.lock);
$('btnDoor').addEventListener('click', actions.door);
$('btnRetrieve').addEventListener('click', actions.retrieveAll);

const slider = $('angle');
slider.max = SPEC.hopper.maxAngle;
slider.addEventListener('input', () => locker.setHopperAngle(parseFloat(slider.value)));

// ---------- toggles ----------
const toggles = {
  tgXray: (on) => {
    xray = on;
    setXray(mats, on);
  },
  tgCut: (on) => locker.setSectionCut(on),
  tgExplode: (on) => {
    locker.setExplode(on);
    // afasta/aproxima a câmera para enquadrar as peças separadas
    const t = controls.target.clone();
    const p0 = camera.position.clone();
    const p1 = t.clone().add(p0.clone().sub(t).multiplyScalar(on ? 1.55 : 1 / 1.55));
    tween(1.0, (e) => camera.position.lerpVectors(p0, p1, e));
  },
  tgDims: (on) => dims.setVisible(on),
  tgEdges: (on) => locker.setEdges(on),
  tgRotate: (on) => (controls.autoRotate = on),
  tgSound: (on) => setMuted(!on),
};
for (const [id, fn] of Object.entries(toggles)) {
  $(id).addEventListener('change', (e) => fn(e.target.checked));
}
function flip(id) {
  const el = $(id);
  el.checked = !el.checked;
  el.dispatchEvent(new Event('change'));
}

// ---------- acabamentos ----------
const sw = $('swatches');
function luminance(hex) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
function setFinish(key) {
  applyFinish(mats, key);
  const f = FINISHES[key];
  const light = luminance(f.front) > 0.45;
  for (const d of locker.decals) {
    d.color.set(light ? '#2a2e33' : '#ffffff');
    d.opacity = light ? 0.5 : 0.55;
  }
  $('finishName').textContent = f.label;
  $('finishCode').textContent = f.code;
  sw.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
}
for (const [key, f] of Object.entries(FINISHES)) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.dataset.key = key;
  b.title = f.label;
  b.style.background = f.body;
  const i = document.createElement('i');
  i.style.background = f.front;
  b.appendChild(i);
  b.addEventListener('click', () => setFinish(key));
  sw.appendChild(b);
}
setFinish('grafite');

// ---------- interação 3D ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tooltip = $('tooltip');

function visibleChain(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  for (const h of raycaster.intersectObject(locker.root, true)) {
    const o = h.object;
    if (!o.isMesh || !visibleChain(o)) continue;
    if (xray && o.userData.shell) continue;
    let a = o;
    while (a && !a.userData.action) a = a.parent;
    return a ? { action: a.userData.action, target: a } : null;
  }
  return null;
}

function hint(p) {
  if (!p) return '';
  switch (p.action) {
    case 'hopper':
      return locker.hopperOpen ? 'Fechar basculante · ou arraste' : 'Abrir basculante · ou arraste';
    case 'door':
      if (locker.doorOpen) return 'Fechar porta';
      return locker.lock.locked ? 'Porta trancada' : 'Abrir porta';
    case 'lock':
      return locker.lock.locked ? 'Destrancar (girar a chave)' : 'Trancar';
    case 'parcel':
      return `Retirar encomenda ${p.target.userData.parcel.code}`;
  }
  return '';
}

let drag = null;
let down = null;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const p = pick(e);
  down = { x: e.clientX, y: e.clientY, p };
  if (p?.action === 'hopper') {
    drag = { y: e.clientY, a0: locker.hopper.angle, moved: false };
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) locker.setHopperAngle(drag.a0 + dy * 0.3, true);
    return;
  }
  if (e.buttons) {
    tooltip.classList.remove('show');
    return;
  }
  const text = hint(pick(e));
  canvas.style.cursor = text ? 'pointer' : 'grab';
  tooltip.classList.toggle('show', !!text);
  if (text) {
    tooltip.textContent = text;
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
  }
});

canvas.addEventListener('pointerleave', () => tooltip.classList.remove('show'));

canvas.addEventListener('pointerup', (e) => {
  if (drag) {
    const moved = drag.moved;
    drag = null;
    controls.enabled = true;
    if (!moved) actions.hopper();
    return;
  }
  if (!down) return;
  const click = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
  const p = down.p;
  down = null;
  if (!click || !p) return;
  if (p.action === 'door') actions.door();
  else if (p.action === 'lock') actions.lock();
  else if (p.action === 'parcel') parcels.retrieve(p.target.userData.item).then(handle);
});

// ---------- teclado ----------
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const map = {
    p: actions.deposit,
    b: actions.hopper,
    l: actions.lock,
    d: actions.door,
    r: actions.retrieveAll,
    x: () => flip('tgXray'),
    c: () => flip('tgCut'),
    e: () => flip('tgExplode'),
    m: () => flip('tgDims'),
    k: () => flip('tgEdges'),
    g: () => flip('tgRotate'),
    s: () => flip('tgSound'),
    1: () => goView('persp'),
    2: () => goView('front'),
    3: () => goView('side'),
    4: () => goView('top'),
  };
  if (map[k]) {
    e.preventDefault();
    map[k]();
  }
});

// ---------- painel mobile ----------
$('panelToggle').addEventListener('click', () => {
  panel.classList.toggle('collapsed');
  setTimeout(updateViewOffset, 320);
});

// ---------- status ----------
const ui = {
  hopper: $('stHopper'),
  baffle: $('stBaffle'),
  lock: $('stLock'),
  door: $('stDoor'),
  count: $('stCount'),
  capBar: $('capBar'),
  capLabel: $('capLabel'),
  angleVal: $('angleVal'),
  btnHopper: $('btnHopper'),
  btnLock: $('btnLock'),
  btnDoor: $('btnDoor'),
};
function set(el, text, cls = '') {
  if (el._t !== text) {
    el.textContent = text;
    el._t = text;
  }
  if (el._c !== cls) {
    el.className = cls;
    el._c = cls;
  }
}
function setBtn(el, label, key) {
  const html = `${label} <kbd>${key}</kbd>`;
  if (el._h !== html) {
    el.innerHTML = html;
    el._h = html;
  }
}

function updateStatus() {
  const ha = locker.hopper.angle;
  const max = SPEC.hopper.maxAngle;
  if (ha < 0.3) set(ui.hopper, 'Fechado');
  else if (Math.abs(ha - locker.hopper.target) > 0.1) set(ui.hopper, `Movendo ${ha.toFixed(0)}°`, 'warn');
  else set(ui.hopper, ha >= max - 0.1 ? `Aberto ${max}°` : `Aberto ${ha.toFixed(0)}°`, 'on');

  const ba = locker.baffleAngle - baffleRest;
  set(ui.baffle, ba > 8 ? `Bloqueando ${ba.toFixed(0)}°` : 'Recolhido', ba > 8 ? 'on' : '');

  if (locker.lock.busy) set(ui.lock, 'Girando chave…', 'warn');
  else set(ui.lock, locker.lock.locked ? 'Trancada' : 'Destrancada', locker.lock.locked ? 'ok' : 'on');

  const da = locker.door.angle;
  set(ui.door, da < 0.3 ? 'Fechada' : `Aberta ${da.toFixed(0)}°`, da < 0.3 ? '' : 'on');

  const n = parcels.count + (parcels.inHopper ? 1 : 0);
  set(ui.count, parcels.inHopper ? `${parcels.count} + 1 no basculante` : `${n} unid.`, n ? 'on' : '');
  const occ = Math.round(parcels.occupancy * 100);
  if (ui.capBar._v !== occ) {
    ui.capBar.style.width = occ + '%';
    ui.capBar._v = occ;
    ui.capLabel.textContent = `Ocupação ${occ}%`;
  }

  set(ui.angleVal, `${ha.toFixed(0)}°`);
  if (document.activeElement !== slider) slider.value = ha;

  setBtn(ui.btnHopper, locker.hopperOpen ? 'Fechar basculante' : 'Abrir basculante', 'B');
  setBtn(ui.btnLock, locker.lock.locked ? 'Destrancar' : 'Trancar', 'L');
  setBtn(ui.btnDoor, locker.doorOpen ? 'Fechar porta' : 'Abrir porta', 'D');
}

// ---------- loop ----------
function simulate(dt) {
  updateTweens(dt);
  locker.update(dt);
  parcels.update(dt);
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  simulate(Math.min((now - last) / 1000, 0.05));
  last = now;
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  updateStatus();
});

// acesso para depuração no console (ex.: avançar a simulação: __step(2) = 2 s)
Object.assign(window, {
  locker,
  parcels,
  scene,
  camera,
  renderer,
  __step: (seconds = 1) => {
    for (let t = 0; t < seconds; t += 1 / 60) simulate(1 / 60);
  },
});
