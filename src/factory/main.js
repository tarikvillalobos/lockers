import './factory.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { setAnisotropy, smooth } from './kit.js';
import { STATIONS, OVERVIEW, TAKT } from './layout.js';
import { buildFactory } from './factory.js';

const $ = (id) => document.getElementById(id);
const host = $('viewport');

// ---------- renderizador ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe6ee');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.32;

const camera = new THREE.PerspectiveCamera(38, 1, 0.15, 700);
camera.position.set(...OVERVIEW.p);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...OVERVIEW.t);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 1.2;
controls.maxDistance = 130;
controls.autoRotateSpeed = 0.35;

// ---------- luz ----------
scene.add(new THREE.HemisphereLight(0xf3f7ff, 0x7d786e, 0.62));
const key = new THREE.DirectionalLight(0xfff3e2, 2.25);
key.position.set(-16, 48, 26);
key.target.position.set(-2.5, 0, -1);
key.castShadow = true;
Object.assign(key.shadow.camera, { left: -46, right: 46, top: 25, bottom: -25, near: 8, far: 120 });
key.shadow.bias = -0.00035;
key.shadow.normalBias = 0.035;
key.shadow.autoUpdate = false;
key.shadow.needsUpdate = true;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xdbe8ff, 0.3);
fill.position.set(30, 22, -24);
scene.add(fill);

// ---------- pós-processamento ----------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 4, 4);
gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.4, scale: 1.25, samples: 12, screenSpaceRadius: false });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
gtao.blendIntensity = 1.0;
// a oclusão é calculada em meia resolução (o resultado é suavizado e combinado na resolução cheia)
{
  const setSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => setSize(Math.ceil(w * 0.5), Math.ceil(h * 0.5));
}
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.16, 0.5, 1.6);
composer.addPass(bloom);
// vinheta + leve contraste, ainda em espaço linear
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - amount * smoothstep(0.25, 0.9, dot(d, d) * 2.2);
      c.rgb *= v; gl_FragColor = c; }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());
const smaa = new SMAAPass();
composer.addPass(smaa);

// ---------- qualidade ----------
const QUALITY = {
  // em alta resolução o MSAA custa caro: usa-se SMAA (pós-processo) no lugar
  media: { dpr: 1, ao: false, shadow: 2048, samples: 4, smaa: false },
  alta: { dpr: 1.5, ao: true, shadow: 4096, samples: 0, smaa: true },
  ultra: { dpr: 2, ao: true, shadow: 4096, samples: 0, smaa: true },
};
let quality = 'ultra';
function applyQuality(q) {
  quality = q;
  const cfg = QUALITY[q];
  const dpr = Math.min(window.devicePixelRatio || 1, cfg.dpr);
  renderer.setPixelRatio(dpr);
  composer.setPixelRatio(dpr);
  gtao.enabled = cfg.ao;
  smaa.enabled = cfg.smaa;
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
    if (rt.samples !== cfg.samples) {
      rt.samples = cfg.samples;
      rt.dispose();
    }
  }
  if (key.shadow.mapSize.x !== cfg.shadow) {
    key.shadow.mapSize.set(cfg.shadow, cfg.shadow);
    key.shadow.map?.dispose();
    key.shadow.map = null;
    key.shadow.needsUpdate = true;
  }
  for (const b of $('qualitySeg').children) b.classList.toggle('active', b.dataset.q === q);
  resize();
}
function resize() {
  const w = host.clientWidth,
    h = host.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.fov = camera.aspect < 0.8 ? 58 : camera.aspect < 1.2 ? 46 : 38; // abre o campo em telas em pé
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- câmera: voo entre estações ----------
let fly = null;
function flyTo(p, t, dur = 2.2) {
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t), k: 0, dur };
}
let station = -1;
let tour = true;
let tourClock = 0;
const DWELL = 15;
function gotoStation(i, user = false) {
  station = i;
  const s = STATIONS[i];
  flyTo(s.cam.p, s.cam.t, user ? 1.8 : 2.6);
  $('stN').textContent = s.n;
  $('stName').textContent = s.name;
  $('stText').textContent = s.text;
  $('stSpecs').innerHTML = s.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  for (const b of $('strip').children) b.classList.toggle('active', Number(b.dataset.i) === i);
  tourClock = 0;
}
function setTour(on) {
  tour = on;
  $('btnTour').classList.toggle('active', on);
  controls.autoRotate = on;
}

// ---------- interface ----------
$('strip').innerHTML = STATIONS.map((s, i) => `<button data-i="${i}"><span class="n">${s.n}</span><span class="t">${s.name}</span></button>`).join('');
$('strip').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  setTour(false);
  gotoStation(Number(b.dataset.i), true);
});
let playing = true;
let speed = 2;
$('btnPlay').addEventListener('click', () => {
  playing = !playing;
  $('btnPlay').textContent = playing ? '❚❚' : '▶';
});
$('speedSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  speed = Number(b.dataset.speed);
  for (const x of $('speedSeg').children) x.classList.toggle('active', x === b);
  $('kTakt').textContent = `${Math.round(TAKT / speed)} s`;
});
$('btnTour').addEventListener('click', () => {
  setTour(!tour);
  if (tour) gotoStation(station < 0 ? 0 : station);
});
$('btnOverview').addEventListener('click', () => {
  setTour(false);
  station = -1;
  for (const b of $('strip').children) b.classList.remove('active');
  flyTo(OVERVIEW.p, OVERVIEW.t, 2.2);
  $('stN').textContent = '00';
  $('stName').textContent = 'Vista geral da planta';
  $('stText').textContent = 'Fluxo em U: o almoxarifado à esquerda abastece a fabricação na fileira de trás; pintura no laço da direita, montagem na fileira da frente e o estoque de acabados à direita, ao lado da expedição. Arraste para orbitar e use o scroll para aproximar.';
  $('stSpecs').innerHTML = [['Galpão', '81 × 30 m'], ['Estações', '9'], ['Robôs', '12 braços + 3 empilhadeiras']].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
});
$('qualitySeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) {
    autoQuality = false;
    applyQuality(b.dataset.q);
  }
});
renderer.domElement.addEventListener('pointerdown', () => {
  if (tour) setTour(false);
  fly = null;
});
function setClean(on) {
  document.body.classList.toggle('clean', on);
  const b = $('btnClean');
  b.title = on ? 'Mostrar a interface (H)' : 'Esconder a interface e ver só a fábrica (H)';
  b.setAttribute('aria-label', on ? 'Mostrar a interface' : 'Esconder a interface');
  try {
    localStorage.setItem('fab-clean', on ? '1' : '0');
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
}
$('btnClean').addEventListener('click', () => setClean(!document.body.classList.contains('clean')));
try {
  if (localStorage.getItem('fab-clean') === '1') setClean(true);
} catch {
  /* ignora */
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') setClean(!document.body.classList.contains('clean'));
  if (e.key === ' ') {
    e.preventDefault();
    $('btnPlay').click();
  } else if (e.key === 'ArrowRight') {
    setTour(false);
    gotoStation((station + 1 + STATIONS.length) % STATIONS.length, true);
  } else if (e.key === 'ArrowLeft') {
    setTour(false);
    gotoStation((station - 1 + STATIONS.length) % STATIONS.length, true);
  }
});

// ---------- laço ----------
let sim = null;
let autoQuality = true;
const clock = new THREE.Clock();
let frameN = 0;
let fpsT = 0,
  fpsN = 0,
  slow = 0;
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  if (!sim) return;
  if (playing) sim.update(dt * speed);
  if (fly) {
    fly.k = Math.min(1, fly.k + dt / fly.dur);
    const e = smooth(fly.k);
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.k >= 1) fly = null;
  }
  if (tour && !fly) {
    tourClock += dt;
    if (tourClock > DWELL) gotoStation((station + 1) % STATIONS.length);
  }
  controls.update();
  // o mapa de sombras é refeito em quadros alternados
  if (frameN++ % 2 === 0) key.shadow.needsUpdate = true;
  composer.render();

  // painel
  $('kProduced').textContent = sim.state.produced;
  $('stBar').style.width = `${(sim.state.u * 100).toFixed(1)}%`;
  $('stFoot').textContent = `ciclo ${String(Math.round(sim.state.u * 100)).padStart(2, '0')} % · armário nº ${sim.state.produced + 1}`;
  fpsT += raw;
  fpsN++;
  if (fpsT >= 1) {
    const fps = fpsN / fpsT;
    $('fps').textContent = `${Math.round(fps)} fps`;
    // baixa a qualidade sozinho se a máquina não acompanhar
    if (autoQuality && document.visibilityState === 'visible') {
      slow = fps < 22 ? slow + 1 : 0;
      if (slow >= 3 && quality !== 'media') {
        applyQuality(quality === 'ultra' ? 'alta' : 'media');
        slow = 0;
      }
    }
    fpsT = 0;
    fpsN = 0;
  }
}

async function start() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 40px Barlow'), document.fonts.load('500 40px Barlow'), document.fonts.load('500 20px "IBM Plex Mono"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* segue com a fonte do sistema */
  }
  await new Promise((r) => setTimeout(r, 30));
  sim = buildFactory(scene);
  applyQuality('ultra');
  $('kTakt').textContent = `${Math.round(TAKT / speed)} s`;
  renderer.compile(scene, camera);
  gotoStation(0);
  camera.position.set(...OVERVIEW.p);
  controls.target.set(...OVERVIEW.t);
  flyTo(STATIONS[0].cam.p, STATIONS[0].cam.t, 4.5);
  setTour(true);
  $('loading').classList.add('done');
  window.__fab = {
    sim,
    scene,
    camera,
    controls,
    renderer,
    goto: (i) => {
      setTour(false);
      gotoStation(i, true);
      fly = null;
      camera.position.set(...STATIONS[i].cam.p);
      controls.target.set(...STATIONS[i].cam.t);
    },
    view: (p, t) => {
      setTour(false);
      fly = null;
      camera.position.set(...p);
      controls.target.set(...t);
    },
    step: (dt = 0) => {
      sim.update(dt);
      key.shadow.needsUpdate = true;
      controls.update();
      composer.render();
    },
    setPlaying: (v) => (playing = v),
    composer,
    gtao,
    bloom,
    quality: applyQuality,
  };
}
frame();
start().catch((err) => {
  console.error(err);
  $('loadingStep').textContent = 'erro ao montar a fábrica: ' + err.message;
});
