// Máquinas e adereços da linha. Cada função devolve { group, ...partes móveis }.
// Convenção: origem no chão, no centro da máquina; medidas em metros.
import * as THREE from 'three';
import { M, box, rbox, cyl, beam, tube, bake, shadows, panel, signTexture, screenTexture, cartonTexture, ribbedTexture } from './kit.js';

const G = () => new THREE.Group();
const keep = (o) => ((o.userData.keep = true), o);
const finish = (g) => shadows(bake(g));

// torre de sinalização (andon)
export function lightTower(state = 'green') {
  const g = G();
  g.add(cyl(M.dark, 0.012, 0.3, 0, 0, 0, 'y', 8));
  const cols = [['red', M.ledRed], ['amber', M.ledAmber], ['green', M.ledGreen]];
  cols.forEach(([n, m], i) => g.add(cyl(n === state ? m : M.ledOff, 0.035, 0.07, 0, 0.3 + (2 - i) * 0.075, 0, 'y', 14)));
  g.add(cyl(M.dark, 0.036, 0.015, 0, 0.525, 0, 'y', 14));
  return g;
}

// console de comando com tela
export function console_(title, rows, opts) {
  const g = G();
  g.add(rbox(M.anthracite, 0.46, 0.9, 0.34, 0, 0, 0, 0.02));
  const head = rbox(M.anthracite, 0.6, 0.44, 0.08, 0, 0.98, 0.02, 0.015);
  head.rotation.x = -0.25;
  g.add(head);
  const sc = panel(screenTexture(title, rows, opts), 0.52, 0.34, { emissive: true, intensity: 1.5 });
  sc.position.set(0, 1.2, 0.075);
  sc.rotation.x = -0.25;
  g.add(sc);
  g.add(cyl(M.ledRed, 0.03, 0.02, 0.17, 0.9, 0.17, 'y', 12));
  return g;
}

export function sheetStack() {
  const g = G();
  for (const z of [-1.1, 0, 1.1]) g.add(box(M.wood, 1.5, 0.1, 0.12, 0, 0, z));
  g.add(box(M.wood, 1.56, 0.03, 3.06, 0, 0.1, 0));
  const side = new THREE.MeshStandardMaterial({ map: ribbedTexture('#9aa1a8', 0.3), roughness: 0.4, metalness: 0.8 });
  side.map.rotation = Math.PI / 2;
  side.map.repeat.set(1, 3);
  const stack = keep(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 3.0), [side, side, M.sheet, M.sheet, side, side]));
  stack.castShadow = stack.receiveShadow = true;
  g.add(stack);
  const out = { group: g, top: 0.13 };
  out.setCount = (n) => {
    const h = Math.max(0.004, n * 0.005);
    stack.scale.y = h;
    stack.position.y = 0.13 + h / 2;
    out.top = 0.13 + h;
  };
  out.setCount(30);
  shadows(g);
  return out;
}

// pórtico de carga a vácuo: trilhos ao longo de X (de x0 a x1), ponte ao longo de Z
export function gantryLoader(x0, x1, half = 1.45) {
  const g = G();
  const H = 3.0;
  for (const z of [-half, half]) {
    g.add(box(M.blue, x1 - x0 + 0.4, 0.22, 0.16, (x0 + x1) / 2, H, z));
    for (const x of [x0, (x0 + x1) / 2, x1]) {
      g.add(box(M.blue, 0.16, H, 0.16, x, 0, z));
      g.add(box(M.iron, 0.36, 0.02, 0.36, x, 0, z));
    }
    g.add(box(M.steel, x1 - x0, 0.03, 0.05, (x0 + x1) / 2, H + 0.22, z));
  }
  const fixed = finish(g);
  const root = G();
  root.add(fixed);
  const bridge = G();
  bridge.add(box(M.safety, 0.3, 0.3, half * 2 + 0.3, 0, H + 0.25, 0));
  bridge.add(rbox(M.anthracite, 0.5, 0.5, 0.5, 0, H + 0.1, 0, 0.03));
  bridge.add(box(M.dark, 0.1, 0.5, 0.2, 0.3, H + 0.3, 0.6));
  root.add(shadows(bridge));
  const ram = G();
  ram.add(box(M.steel, 0.14, 2.2, 0.14, 0, 0.18, 0));
  // quadro de ventosas 2,6 × 1,2 m (comprido em X… a chapa fica com 3 m ao longo de X)
  ram.add(box(M.alu, 2.7, 0.06, 0.08, 0, 0.12, 0));
  for (const x of [-1.2, -0.4, 0.4, 1.2]) {
    ram.add(box(M.alu, 0.06, 0.05, 1.2, x, 0.07, 0));
    for (const z of [-0.5, 0.5]) {
      ram.add(cyl(M.steel, 0.01, 0.06, x, 0.02, z, 'y', 6));
      ram.add(cyl(M.rubber, 0.05, 0.03, x, 0, z, 'y', 14, 0.03));
    }
  }
  bridge.add(shadows(ram));
  return { group: root, bridge, ram, H };
}

// mesa de troca do laser (estrutura fixa) + palete móvel com grelha de apoio
export function laserTable() {
  const g = G();
  for (const x of [-1.5, 1.5]) for (const z of [-0.8, 0.8]) g.add(box(M.anthracite, 0.12, 0.72, 0.12, x, 0, z));
  for (const z of [-0.8, 0.8]) g.add(box(M.anthracite, 3.2, 0.12, 0.1, 0, 0.62, z));
  for (const x of [-1.5, 0, 1.5]) g.add(box(M.anthracite, 0.08, 0.08, 1.6, x, 0.5, 0));
  for (const z of [-0.8, 0.8]) g.add(box(M.steel, 3.3, 0.03, 0.05, 0, 0.74, z));
  return finish(g);
}
export function laserPallet() {
  const g = G();
  g.add(box(M.iron, 3.2, 0.06, 0.06, 0, 0, -0.8));
  g.add(box(M.iron, 3.2, 0.06, 0.06, 0, 0, 0.8));
  g.add(box(M.iron, 0.06, 0.06, 1.6, -1.57, 0, 0));
  g.add(box(M.iron, 0.06, 0.06, 1.6, 1.57, 0, 0));
  const n = 30;
  const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.07, 1.56), M.iron, n);
  for (let i = 0; i < n; i++) slats.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-1.5 + (3.0 * i) / (n - 1), 0.035, 0));
  slats.castShadow = false;
  slats.receiveShadow = true;
  g.add(slats);
  shadows(g);
  slats.castShadow = false;
  g.userData.top = 0.072; // altura da face de apoio da chapa
  return g;
}

export function laserMachine() {
  const g = G();
  const L = 3.9,
    Dd = 2.7,
    H = 2.25;
  // base e cabine (aberta nas duas pontas em X por onde passa a mesa)
  g.add(box(M.anthracite, L, 0.5, Dd, 0, 0, 0));
  g.add(rbox(M.white, L, 0.44, 0.12, 0, 0.5, Dd / 2 - 0.06, 0.02));
  g.add(rbox(M.white, L, H - 0.5, 0.12, 0, 0.5, -Dd / 2 + 0.06, 0.02));
  g.add(rbox(M.white, L, 0.14, Dd, 0, H - 0.14, 0, 0.03));
  g.add(rbox(M.white, L, 0.34, 0.12, 0, H - 0.48, Dd / 2 - 0.06, 0.02));
  for (const x of [-L / 2 + 0.07, L / 2 - 0.07]) g.add(rbox(M.white, 0.14, 0.75, Dd, x, H - 0.89, 0, 0.02));
  for (const x of [-L / 2 + 0.07, L / 2 - 0.07]) g.add(box(M.white, 0.14, H - 0.5, 0.5, x, 0.5, Dd / 2 - 0.25));
  for (const x of [-L / 2 + 0.07, L / 2 - 0.07]) g.add(box(M.white, 0.14, H - 0.5, 0.5, x, 0.5, -Dd / 2 + 0.25));
  // faixa laranja + marca
  g.add(box(M.orange, L + 0.01, 0.05, 0.125, 0, 0.93, Dd / 2 - 0.06));
  const logo = panel(signTexture(['FIBRA 6kW', 'LASER CNC 3015'], { w: 1024, h: 256, bg: '#e7eaec', fg: '#1f2226', size: 96, sub: 40, align: 'left', accent: '#ef6a1a' }), 1.5, 0.375);
  logo.position.set(-L / 2 + 0.95, 0.72, Dd / 2 + 0.002);
  g.add(logo);
  // exaustão
  g.add(rbox(M.light, 0.9, 1.3, 0.8, L / 2 - 0.7, 0, -Dd / 2 - 0.5, 0.03));
  g.add(cyl(M.galv, 0.16, 5.2, L / 2 - 0.7, 1.3, -Dd / 2 - 0.5, 'y', 14));
  // chiller e fonte
  g.add(rbox(M.light, 0.8, 1.5, 0.7, -L / 2 + 0.6, 0, -Dd / 2 - 0.45, 0.03));
  g.add(box(M.dark, 0.5, 0.5, 0.02, -L / 2 + 0.6, 0.7, -Dd / 2 - 0.09));
  const fixed = finish(g);
  const root = G();
  root.add(fixed);
  // janela (vidro verde-escuro de proteção)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.2, 0.8), M.glassDark);
  win.position.set(0, 1.37, Dd / 2 - 0.01);
  root.add(win);
  // pórtico interno + cabeçote
  const bridge = G();
  bridge.add(box(M.anthracite, 0.24, 0.26, Dd - 0.5, 0, 1.25, 0));
  bridge.add(box(M.steel, 0.02, 0.05, Dd - 0.6, 0.13, 1.33, 0));
  const head = G();
  head.add(rbox(M.light, 0.16, 0.36, 0.16, 0.2, 0.96, 0, 0.02));
  head.add(cyl(M.copper, 0.022, 0.07, 0.2, 0.89, 0, 'y', 12, 0.04));
  head.add(cyl(M.steel, 0.008, 0.03, 0.2, 0.86, 0, 'y', 8));
  bridge.add(head);
  root.add(shadows(bridge));
  // luz interna
  const strip = new THREE.Mesh(new THREE.BoxGeometry(L - 0.6, 0.02, 0.05), M.lamp);
  strip.position.set(0, H - 0.17, Dd / 2 - 0.3);
  root.add(strip);
  const con = console_('LASER 3015', [['Programa', 'LR1020-A3'], ['Potência', '6,0 kW', 0.86], ['Gás', 'N₂ 14 bar', 0.7], ['Chapa', '2,0 mm']], { color: '#ffb03a' });
  con.position.set(L / 2 + 0.5, 0, Dd / 2 + 0.2);
  con.rotation.y = -0.5;
  root.add(shadows(con));
  const tw = lightTower('green');
  tw.position.set(L / 2 - 0.2, H, Dd / 2 - 0.25);
  root.add(tw);
  return { group: root, bridge, head, L, D: Dd, H, tipY: 0.9 };
}

// trilho do robô (7º eixo)
export function robotRail(len) {
  const g = G();
  g.add(box(M.anthracite, len, 0.12, 0.9, 0, 0, 0));
  for (const z of [-0.3, 0.3]) g.add(box(M.steel, len, 0.04, 0.06, 0, 0.12, z));
  g.add(box(M.dark, len, 0.05, 0.14, 0, 0.12, 0));
  g.add(box(M.hazard, len + 0.3, 0.012, 0.12, 0, 0, -0.56));
  g.add(box(M.hazard, len + 0.3, 0.012, 0.12, 0, 0, 0.56));
  for (const x of [-len / 2, len / 2]) g.add(box(M.safety, 0.1, 0.3, 0.9, x, 0, 0));
  return finish(g);
}
export function railCarriage() {
  const g = G();
  g.add(rbox(M.anthracite, 1.0, 0.1, 1.0, 0, 0.16, 0, 0.02));
  g.add(box(M.dark, 0.3, 0.2, 0.2, -0.3, 0.26, -0.5));
  return shadows(g);
}

// dobradeira CNC: linha da matriz ao longo de X em z = +0.6 (operador em +z)
export function pressBrake() {
  const g = G();
  const L = 3.2,
    hd = 0.95;
  for (const x of [-L / 2 - 0.12, L / 2 + 0.12]) {
    g.add(box(M.anthracite, 0.18, 2.5, 1.5, x, 0, -0.05));
    g.add(box(M.anthracite, 0.2, 0.9, 0.5, x, 0, 0.75));
  }
  g.add(box(M.anthracite, L, 0.82, 0.24, 0, 0, 0.6)); // mesa
  g.add(rbox(M.white, L, 0.5, 0.05, 0, 0.2, 0.74, 0.01));
  g.add(box(M.steel, L, 0.07, 0.12, 0, 0.82, 0.6)); // porta-matriz
  g.add(box(M.iron, L, 0.06, 0.07, 0, 0.89, 0.6)); // matriz em V
  g.add(box(M.light, L + 0.4, 0.5, 1.2, 0, 2.0, -0.2)); // cabeçote fixo / reservatório
  g.add(box(M.anthracite, L, 1.2, 0.5, 0, 0.0, -0.5)); // corpo de trás
  // encostos traseiros
  for (const x of [-0.8, 0, 0.8]) {
    g.add(box(M.steel, 0.06, 0.05, 0.5, x, hd - 0.02, 0.2));
    g.add(box(M.red, 0.07, 0.08, 0.05, x, hd - 0.01, 0.44));
  }
  // cortina de luz
  for (const x of [-L / 2 - 0.3, L / 2 + 0.3]) g.add(box(M.safety, 0.07, 1.5, 0.07, x, 0.2, 1.0));
  const logo = panel(signTexture(['DOBRA CNC 110 t', '3100 mm · 6 eixos'], { w: 1024, h: 256, bg: '#e7eaec', fg: '#1f2226', size: 92, sub: 40, align: 'left', accent: '#1f4fa3' }), 1.5, 0.375);
  logo.position.set(-0.7, 2.25, 0.401);
  g.add(logo);
  const fixed = finish(g);
  const root = G();
  root.add(fixed);
  // avental móvel (desce para dobrar): y = 0 → fechado sobre a matriz
  const ram = G();
  ram.add(rbox(M.white, L, 0.72, 0.16, 0, 0.26, 0.6, 0.015));
  ram.add(box(M.blue, L + 0.005, 0.06, 0.165, 0, 0.8, 0.6));
  ram.add(box(M.steel, L, 0.1, 0.06, 0, 0.16, 0.6)); // porta-punção
  const punch = new THREE.Mesh(new THREE.BoxGeometry(L, 0.16, 0.014), M.iron);
  punch.position.set(0, 0.08, 0.6);
  ram.add(punch);
  for (const x of [-L / 2 + 0.3, L / 2 - 0.3]) ram.add(cyl(M.chrome, 0.07, 0.6, x, 0.98, 0.5, 'y', 16));
  ram.position.y = hd;
  root.add(shadows(ram));
  // pendente com tela
  const arm = G();
  arm.add(box(M.anthracite, 0.06, 0.06, 0.9, L / 2 + 0.25, 2.2, 0.75));
  arm.add(box(M.anthracite, 0.06, 0.7, 0.06, L / 2 + 0.25, 1.5, 1.2));
  const sc = rbox(M.anthracite, 0.5, 0.4, 0.07, L / 2 + 0.25, 1.15, 1.2, 0.015);
  arm.add(sc);
  const scr = panel(screenTexture('DOBRA', [['Ângulo', '90,0°'], ['Força', '38 t', 0.35], ['Y1 / Y2', '112,40'], ['Passo', '1 / 8']], { color: '#4aa3ff' }), 0.44, 0.3, { emissive: true, intensity: 1.5 });
  scr.position.set(L / 2 + 0.25, 1.36, 1.24);
  arm.add(scr);
  root.add(shadows(arm));
  const tw = lightTower('green');
  tw.position.set(L / 2 + 0.1, 2.5, 0.2);
  root.add(tw);
  return { group: root, ram, hd, L };
}

// transportador de roletes ao longo de X, de x = 0 a len
export function rollerConveyor(len, w = 0.9, h = 0.8) {
  const g = G();
  for (const z of [-w / 2, w / 2]) g.add(box(M.light, len, 0.12, 0.05, len / 2, h - 0.12, z));
  const nl = Math.max(2, Math.round(len / 1.4) + 1);
  for (let i = 0; i < nl; i++) {
    const x = 0.1 + ((len - 0.2) * i) / (nl - 1);
    for (const z of [-w / 2, w / 2]) g.add(box(M.anthracite, 0.06, h - 0.12, 0.06, x, 0, z));
    g.add(box(M.anthracite, 0.05, 0.05, w, x, 0.25, 0));
  }
  const fixed = finish(g);
  const root = G();
  root.add(fixed);
  const n = Math.floor(len / 0.11);
  const geo = new THREE.CylinderGeometry(0.035, 0.035, w - 0.06, 12);
  geo.rotateX(Math.PI / 2);
  const rollers = new THREE.InstancedMesh(geo, M.galv, n);
  for (let i = 0; i < n; i++) rollers.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0.06 + i * 0.11, h - 0.035, 0));
  rollers.castShadow = true;
  rollers.receiveShadow = true;
  root.add(rollers);
  root.userData.top = h;
  return root;
}

// pulmão vertical de peças (de onde saem as peças dobradas para a solda)
export function bufferTower() {
  const g = G();
  g.add(rbox(M.white, 1.3, 2.6, 1.5, 0, 0, 0, 0.04));
  g.add(box(M.dark, 0.02, 0.7, 1.1, 0.655, 0.75, 0));
  g.add(box(M.blue, 1.31, 0.08, 1.51, 0, 2.1, 0));
  const lg = panel(signTexture(['PULMÃO', 'PEÇAS DOBRADAS'], { w: 512, h: 256, bg: '#e7eaec', fg: '#1f2226', size: 78, sub: 34 }), 0.9, 0.45);
  lg.position.set(0, 1.75, 0.752);
  g.add(lg);
  const root = G();
  root.add(finish(g));
  const tw = lightTower('green');
  tw.position.set(0.4, 2.6, 0.5);
  root.add(tw);
  return root;
}

// gabarito de solda: posicionador com mesa giratória
export function weldFixture(h = 0.5) {
  const g = G();
  g.add(cyl(M.anthracite, 0.5, 0.06, 0, 0, 0, 'y', 28));
  g.add(cyl(M.blue, 0.24, h - 0.14, 0, 0.06, 0, 'y', 20));
  g.add(cyl(M.steel, 0.42, 0.05, 0, h - 0.08, 0, 'y', 32));
  g.add(cyl(M.iron, 0.46, 0.03, 0, h - 0.03, 0, 'y', 32));
  // grampos e batentes do gabarito
  for (const [x, z] of [[0.27, 0.25], [-0.27, 0.25], [0.27, -0.25], [-0.27, -0.25]]) {
    g.add(box(M.safety, 0.05, 0.16, 0.05, x, h, z));
    g.add(box(M.steel, 0.07, 0.02, 0.07, x, h + 0.16, z));
  }
  return finish(g);
}

// cerca de segurança: postes amarelos + painéis de tela
export function fenceRun(points, h = 2.0) {
  const g = G();
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i],
      [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let k = 0; k < n; k++) {
      const a = [x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n],
        b = [x0 + ((x1 - x0) * (k + 1)) / n, z0 + ((z1 - z0) * (k + 1)) / n];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mat = M.mesh.clone();
      mat.map = M.mesh.map.clone();
      mat.map.repeat.set(l / 0.1, (h - 0.25) / 0.1);
      mat.map.needsUpdate = true;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(l - 0.06, h - 0.25), mat);
      p.position.set((a[0] + b[0]) / 2, 0.2 + (h - 0.25) / 2, (a[1] + b[1]) / 2);
      p.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      p.userData.noShadow = true;
      p.userData.keep = true;
      g.add(p);
      g.add(beam(M.safety, [a[0], 0.2, a[1]], [b[0], 0.2, b[1]], 0.03));
      g.add(beam(M.safety, [a[0], h - 0.05, a[1]], [b[0], h - 0.05, b[1]], 0.03));
      g.add(box(M.safety, 0.06, h, 0.06, a[0], 0, a[1]));
      if (k === n - 1) g.add(box(M.safety, 0.06, h, 0.06, b[0], 0, b[1]));
    }
  }
  const out = finish(g);
  out.traverse((o) => o.isMesh && o.material.alphaTest && ((o.castShadow = false), (o.userData.noAO = true)));
  return out;
}

export function weldSource() {
  const g = G();
  g.add(rbox(M.red, 0.45, 0.75, 0.7, 0, 0.1, 0, 0.03));
  g.add(box(M.dark, 0.3, 0.2, 0.01, 0, 0.55, 0.352));
  for (const x of [-0.18, 0.18]) for (const z of [-0.25, 0.25]) g.add(cyl(M.rubber, 0.05, 0.04, x, 0.05, z, 'x', 10));
  g.add(cyl(M.galv, 0.11, 1.0, 0, 0.85, -0.2, 'y', 14));
  g.add(cyl(M.dark, 0.12, 0.05, 0, 1.85, -0.2, 'y', 14));
  return finish(g);
}

export function fumeHood(w, d, yTop, y = 3.3) {
  const g = G();
  const s = new THREE.Shape();
  // coifa: tronco de pirâmide
  const geo = new THREE.CylinderGeometry(0.35, Math.hypot(w, d) / 2, 0.7, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  geo.scale(w / Math.hypot(w, d) * 1.41, 1, d / Math.hypot(w, d) * 1.41);
  const hood = new THREE.Mesh(geo, M.galv);
  hood.material = M.galv.clone();
  hood.material.side = THREE.DoubleSide;
  hood.position.y = y + 0.35;
  g.add(hood);
  g.add(cyl(M.galv, 0.2, yTop - y - 0.7, 0, y + 0.7, 0, 'y', 14));
  void s;
  return shadows(g);
}

// ---------- pintura ----------
export function washTunnel(len = 6) {
  const g = G();
  const w = 1.7,
    H = 3.4;
  const inox = M.alu;
  const n = 3; // estágios: desengraxe, fosfato, enxágue
  // parede de trás inteira; parede da frente com janelas de inspeção
  g.add(rbox(inox, len, H - 0.2, 0.08, 0, 0.2, -w / 2, 0.01));
  g.add(rbox(inox, len, 1.3, 0.08, 0, 0.2, w / 2, 0.01));
  g.add(rbox(inox, len, H - 2.75, 0.08, 0, 2.75, w / 2, 0.01));
  for (let i = 0; i <= n; i++) g.add(box(inox, i === 0 || i === n ? 0.5 : 0.3, 1.3, 0.08, -len / 2 + (len * i) / n + (i === 0 ? 0.25 : i === n ? -0.25 : 0), 1.48, w / 2));
  g.add(box(inox, len, 0.08, w, 0, H, 0));
  g.add(box(M.anthracite, len, 0.2, w + 0.3, 0, 0, 0));
  // divisórias entre estágios (com passagem para a peça) e barras de bicos
  for (let i = 1; i < n; i++) {
    const x = -len / 2 + (len * i) / n;
    g.add(box(inox, 0.04, H - 0.4, 0.3, x, 0.2, -w / 2 + 0.19));
    g.add(box(inox, 0.04, H - 0.4, 0.3, x, 0.2, w / 2 - 0.19));
  }
  const labels = ['DESENGRAXE', 'FOSFATO', 'ENXÁGUE'];
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / n;
    for (const z of [-w / 2 + 0.14, w / 2 - 0.14]) for (const dx of [-0.35, 0.35]) g.add(cyl(M.blue, 0.025, 1.9, x + dx, 1.1, z, 'y', 8));
    g.add(cyl(M.blue, 0.03, w - 0.2, x - 0.35, 3.0, 0, 'z', 8));
    g.add(cyl(M.blue, 0.03, w - 0.2, x + 0.35, 3.0, 0, 'z', 8));
    // tanque + bomba de cada estágio
    g.add(rbox(inox, len / n - 0.5, 0.8, 0.8, x, 0, w / 2 + 0.62, 0.04));
    g.add(cyl(M.blue, 0.11, 0.36, x + 0.45, 0.22, w / 2 + 1.2, 'x', 14));
    g.add(cyl(M.blue, 0.04, 1.3, x - 0.45, 0.8, w / 2 + 0.3, 'y', 8));
    const lg = panel(signTexture([labels[i]], { w: 512, h: 128, bg: '#1f4fa3', size: 62 }), 1.1, 0.275);
    lg.position.set(x, 3.05, w / 2 + 0.045);
    g.add(lg);
  }
  g.add(cyl(M.galv, 0.18, 5.4, len / 2 - 0.6, H, 0, 'y', 14));
  const root = G();
  root.add(finish(g));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / n;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(len / n - 0.3, 1.27), M.glass);
    win.position.set(x, 2.13, w / 2);
    root.add(win);
  }
  const l = new THREE.Mesh(new THREE.BoxGeometry(len - 0.6, 0.03, 0.08), M.lamp);
  l.position.set(0, H - 0.06, 0);
  root.add(l);
  root.userData.stages = [0, 1, 2].map((i) => -len / 2 + (len * (i + 0.5)) / n);
  root.userData.w = w;
  return root;
}

export function powderBooth(len = 5) {
  const g = G();
  const w = 2.2,
    H = 3.5;
  // paredes brancas com abertura para as pistolas
  for (const z of [-w / 2, w / 2]) {
    g.add(rbox(M.white, len, 0.9, 0.06, 0, 0, z, 0.01));
    g.add(rbox(M.white, len, 0.5, 0.06, 0, H - 0.5, z, 0.01));
    for (const x of [-len / 2 + 0.5, len / 2 - 0.5]) g.add(rbox(M.white, 1.0, H, 0.06, x, 0, z, 0.01));
    g.add(rbox(M.white, 0.5, H, 0.06, 0, 0, z, 0.01));
  }
  g.add(box(M.white, len, 0.06, w, 0, H, 0));
  g.add(box(M.light, len, 0.12, w, 0, 0, 0));
  // ciclone e filtro de recuperação do pó
  g.add(cyl(M.white, 0.55, 1.6, len / 2 + 1.0, 1.5, -w / 2 - 0.9, 'y', 20));
  g.add(cyl(M.white, 0.55, 1.3, len / 2 + 1.0, 0.2, -w / 2 - 0.9, 'y', 20, 0.12));
  g.add(rbox(M.light, 1.3, 2.6, 1.0, len / 2 + 1.0, 0, -w / 2 - 2.3, 0.03));
  g.add(cyl(M.galv, 0.18, 2.2, len / 2 - 0.2, 2.6, -w / 2 - 0.9, 'x', 14));
  g.add(cyl(M.galv, 0.18, 5.6, len / 2 + 1.0, 3.1, -w / 2 - 0.9, 'y', 14));
  // central de pó
  g.add(rbox(M.orange, 0.7, 1.1, 0.7, -len / 2 - 0.2, 0, w / 2 + 1.1, 0.04));
  const lg = panel(signTexture(['CABINE DE PÓ', 'ELETROSTÁTICA · RAL 7016'], { w: 1024, h: 256, bg: '#e7eaec', fg: '#1f2226', size: 86, sub: 38, align: 'left', accent: '#ef6a1a' }), 2.0, 0.5);
  lg.position.set(-len / 2 + 1.2, 3.25, w / 2 + 0.035);
  g.add(lg);
  const root = G();
  root.add(finish(g));
  // luz da cabine
  for (const z of [-0.5, 0.5]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(len - 0.6, 0.03, 0.08), M.lamp);
    l.position.set(0, H - 0.06, z);
    root.add(l);
  }
  // reciprocadores: colunas + carro com pistolas (um de cada lado, defasados em X)
  const guns = [];
  for (const [x, s] of [[-0.75, 1], [0.75, -1]]) {
    const col = G();
    col.add(box(M.anthracite, 0.3, 3.0, 0.3, 0, 0, 0));
    col.add(box(M.iron, 0.6, 0.04, 0.6, 0, 0, 0));
    col.position.set(x, 0, s * (w / 2 + 0.75));
    root.add(shadows(col));
    const car = G();
    car.add(rbox(M.safety, 0.36, 0.3, 0.36, 0, -0.15, 0, 0.02));
    for (const dy of [-0.32, 0, 0.32]) {
      car.add(cyl(M.steel, 0.018, 0.75, 0, dy, -s * 0.5, 'z', 8));
      car.add(cyl(M.plastic, 0.03, 0.16, 0, dy, -s * 0.93, 'z', 10));
    }
    car.position.set(x, 1.7, s * (w / 2 + 0.75));
    root.add(shadows(car));
    guns.push({ car, x, side: s, tipZ: s * (w / 2 + 0.75) - s * 1.0 });
  }
  const con = console_('CABINE DE PÓ', [['Tensão', '80 kV', 0.8], ['Vazão', '180 g/min', 0.6], ['Recuperação', '96 %', 0.96], ['Cor', 'RAL 7016']], { color: '#ff8a3a' });
  con.position.set(len / 2 + 0.2, 0, w / 2 + 1.0);
  root.add(shadows(con));
  return { group: root, guns, w, H, len };
}

// estufa de cura: túnel ao longo de X (girar no lugar)
export function cureOven(len = 7, { title = 'ESTUFA DE CURA', sub = '200 °C · 10 MIN', bg = '#b3261e', glow = [1.9, 0.62, 0.16], light = 30, full = true } = {}) {
  const g = G();
  const w = 2.3,
    H = 3.7;
  for (const z of [-w / 2, w / 2]) g.add(box(M.insul, len, H - 0.1, 0.16, 0, 0.1, z));
  g.add(box(M.insul, len, 0.16, w + 0.16, 0, H, 0));
  g.add(box(M.anthracite, len, 0.1, w + 0.3, 0, 0, 0));
  // cortinas de ar nas bocas
  for (const x of [-len / 2, len / 2]) {
    g.add(box(M.anthracite, 0.4, 0.5, w + 0.3, x, H - 0.5, 0));
    for (const z of [-w / 2 - 0.02, w / 2 + 0.02]) g.add(box(M.anthracite, 0.4, H, 0.2, x, 0, z));
  }
  if (full) {
    // queimador + recirculação + chaminés
    g.add(rbox(M.light, 1.6, 1.8, 1.0, -len / 4, 0, w / 2 + 0.6, 0.04));
    g.add(cyl(M.red, 0.2, 0.7, -len / 4 - 0.5, 0.9, w / 2 + 1.3, 'z', 14));
    g.add(cyl(M.galv, 0.25, 1.6, -len / 4, 2.6, w / 2 + 0.6, 'y', 16));
    g.add(cyl(M.galv, 0.22, 4.4, len / 4, H + 0.16, 0, 'y', 14));
    g.add(cyl(M.galv, 0.22, 4.4, -len / 4, H + 0.16, 0, 'y', 14));
  } else {
    g.add(rbox(M.light, 0.9, 1.3, 0.7, 0, 0, -w / 2 - 0.5, 0.04));
    g.add(cyl(M.galv, 0.2, 4.4, 0, H + 0.16, 0, 'y', 14));
  }
  const lg = panel(signTexture([title, sub], { w: 1024, h: 256, bg, size: full ? 90 : 84, sub: 40 }), full ? 2.4 : 2.0, full ? 0.6 : 0.5);
  lg.position.set(full ? len / 4 - 0.2 : 0, 2.3, w / 2 + 0.085);
  g.add(lg);
  const root = G();
  root.add(finish(g));
  // interior incandescente
  const hotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...glow), side: THREE.BackSide });
  const inner = new THREE.Mesh(new THREE.BoxGeometry(len - 0.3, H - 0.5, w - 0.4), hotMat);
  inner.position.y = 0.2 + (H - 0.5) / 2;
  inner.userData.noShadow = true;
  root.add(inner);
  const pl = new THREE.PointLight(0xff7a2a, light, 9, 1.6);
  pl.position.set(0, 1.8, 0);
  root.add(pl);
  if (full) {
    const con = console_('ESTUFA', [['Zona 1', '198 °C', 0.92], ['Zona 2', '201 °C', 0.95], ['Tempo', '10 min'], ['Gás', 'GN 14 m³/h', 0.5]], { color: '#ff6a3a' });
    con.position.set(len / 4 + 1.6, 0, w / 2 + 0.7);
    root.add(shadows(con));
  }
  return { group: root, len, w, H };
}

export function coolingTunnel(len = 9) {
  const g = G();
  const w = 1.9,
    H = 3.5;
  const n = Math.round(len / 1.8);
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    for (const z of [-w / 2, w / 2]) g.add(box(M.light, 0.08, H, 0.08, x, 0, z));
    g.add(box(M.light, 0.08, 0.08, w, x, H, 0));
  }
  for (const z of [-w / 2, w / 2]) {
    g.add(box(M.light, len, 0.08, 0.08, 0, H, z));
    g.add(box(M.light, len, 0.08, 0.08, 0, 1.1, z));
  }
  // ventiladores no teto
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / n;
    g.add(cyl(M.anthracite, 0.45, 0.25, x, H - 0.1, 0, 'y', 20));
    g.add(cyl(M.dark, 0.4, 0.02, x, H - 0.13, 0, 'y', 20));
  }
  return finish(g);
}

// estação elevadora de portas (carrega/descarrega os racks do trilho)
export function doorLift(label) {
  const g = G();
  for (const x of [-0.7, 0.7]) for (const z of [-0.75, 0.75]) g.add(box(M.blue, 0.1, 2.9, 0.1, x, 0, z));
  for (const z of [-0.75, 0.75]) g.add(box(M.blue, 1.5, 0.1, 0.1, 0, 2.9, z));
  for (const x of [-0.7, 0.7]) g.add(box(M.blue, 0.1, 0.1, 1.6, x, 2.9, 0));
  g.add(box(M.anthracite, 1.5, 0.12, 1.6, 0, 0, 0));
  for (const z of [-0.75, 0.75]) g.add(cyl(M.chrome, 0.03, 2.8, 0, 0.1, z, 'y', 10));
  const lg = panel(signTexture([label], { w: 512, h: 128, bg: '#1f4fa3', size: 62 }), 1.3, 0.32);
  lg.position.set(0, 3.1, 0.81);
  g.add(lg);
  const root = G();
  root.add(finish(g));
  const plat = G();
  plat.add(box(M.safety, 1.2, 0.06, 1.3, 0, 0, 0));
  plat.add(box(M.steel, 0.9, 0.02, 0.5, 0, 0.06, 0));
  root.add(shadows(plat));
  return { group: root, plat };
}

// ---------- montagem ----------
// linha de montagem (transportador de skids) ao longo de X de x0 a x1 (z = 0)
export function skidLine(x0, x1, h = 0.42) {
  const g = G();
  const len = x1 - x0,
    cx = (x0 + x1) / 2;
  for (const z of [-0.36, 0.36]) {
    g.add(rbox(M.white, len, h - 0.06, 0.14, cx, 0, z, 0.015));
    g.add(box(M.orange, len + 0.002, 0.04, 0.142, cx, h - 0.2, z));
    g.add(box(M.steel, len, 0.02, 0.06, cx, h - 0.06, z));
  }
  g.add(box(M.dark, len, 0.05, 0.5, cx, 0.12, 0));
  const n = Math.round(len / 0.5);
  for (let i = 0; i <= n; i++) g.add(box(M.iron, 0.04, 0.04, 0.72, x0 + (len * i) / n, h - 0.14, 0));
  g.add(rbox(M.anthracite, 0.5, 0.5, 0.9, x1 + 0.2, 0, 0, 0.03));
  g.add(rbox(M.anthracite, 0.5, 0.5, 0.9, x0 - 0.2, 0, 0, 0.03));
  return finish(g);
}
export function skid() {
  const g = G();
  g.add(rbox(M.iron, 0.72, 0.035, 0.66, 0, -0.035, 0, 0.008));
  for (const [x, z] of [[0.27, 0.25], [-0.27, 0.25], [0.27, -0.25], [-0.27, -0.25]]) g.add(cyl(M.safety, 0.025, 0.02, x, 0, z, 'y', 10));
  return shadows(bake(g));
}

// pórtico de posto: 2 colunas atrás da linha + viga com barra de LED e placa
export function stationArch(title, sub, { w = 2.6, color = '#1f4fa3' } = {}) {
  const g = G();
  for (const x of [-w / 2, w / 2]) {
    g.add(box(M.light, 0.1, 2.9, 0.1, x, 0, -0.95));
    g.add(box(M.light, 0.1, 2.9, 0.1, x, 0, 0.95));
    g.add(box(M.light, 0.1, 0.1, 2.0, x, 2.9, 0));
    g.add(box(M.iron, 0.24, 0.015, 0.24, x, 0, -0.95));
    g.add(box(M.iron, 0.24, 0.015, 0.24, x, 0, 0.95));
  }
  g.add(box(M.light, w, 0.1, 0.1, 0, 2.9, -0.95));
  g.add(box(M.light, w, 0.1, 0.1, 0, 2.9, 0.95));
  const sg = panel(signTexture([title, sub], { w: 1024, h: 256, bg: color, size: 92, sub: 40 }), 1.9, 0.475);
  sg.position.set(0, 3.3, 0.96);
  g.add(sg);
  g.add(box(M.anthracite, 1.94, 0.52, 0.03, 0, 3.04, 0.94));
  const root = G();
  root.add(finish(g));
  for (const z of [-0.5, 0.5]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.03, 0.07), M.lamp);
    l.position.set(0, 2.88, z);
    root.add(l);
  }
  const tw = lightTower('green');
  tw.position.set(w / 2, 3.0, 0.95);
  root.add(tw);
  return root;
}

// unidade de aparafusamento (desce do pórtico)
export function screwUnit() {
  const g = G();
  g.add(box(M.anthracite, 0.5, 0.14, 0.44, 0, 0.5, 0));
  g.add(box(M.steel, 0.08, 1.2, 0.08, 0, 0.6, 0));
  for (const [x, z] of [[0.19, 0.1], [-0.19, 0.1], [0.19, -0.1], [-0.19, -0.1]]) {
    g.add(cyl(M.steel, 0.022, 0.42, x, 0.1, z, 'y', 10));
    g.add(cyl(M.chrome, 0.008, 0.1, x, 0, z, 'y', 8));
  }
  return shadows(g);
}

// estante dinâmica com caixas de componentes
export function flowRack(w = 1.6) {
  const g = G();
  for (const x of [-w / 2, w / 2]) for (const z of [-0.3, 0.3]) g.add(box(M.light, 0.04, 1.8, 0.04, x, 0, z));
  for (const y of [0.4, 0.9, 1.4]) {
    const sh = box(M.galv, w, 0.02, 0.68, 0, y, 0);
    sh.rotation.x = 0.12;
    g.add(sh);
    const n = Math.floor(w / 0.34);
    for (let i = 0; i < n; i++) {
      const b = rbox(i % 3 === 0 ? M.blue : i % 3 === 1 ? M.red : M.safety, 0.3, 0.16, 0.42, -w / 2 + 0.19 + i * 0.34, y + 0.03, 0.05, 0.015);
      b.rotation.x = 0.12;
      g.add(b);
    }
  }
  return finish(g);
}

// bancada de submontagem
export function bench(w = 1.8, d = 0.9) {
  const g = G();
  g.add(rbox(M.wood, w, 0.05, d, 0, 0.85, 0, 0.01));
  g.add(box(M.light, w - 0.1, 0.08, d - 0.1, 0, 0.77, 0));
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) g.add(box(M.light, 0.06, 0.77, 0.06, x, 0, z));
  g.add(box(M.light, w - 0.1, 0.03, d - 0.1, 0, 0.2, 0));
  return finish(g);
}

// carrinho de portas: base com rodízios + pente
export function doorCart(w = 1.0, d = 0.7) {
  const g = G();
  g.add(rbox(M.blue, w, 0.08, d, 0, 0.14, 0, 0.015));
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) g.add(cyl(M.rubber, 0.06, 0.04, x, 0.06, z, 'x', 12));
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) g.add(box(M.blue, 0.04, 0.9, 0.04, x, 0.22, -d / 2 + 0.03));
  g.add(box(M.blue, w, 0.04, 0.04, 0, 1.08, -d / 2 + 0.03));
  return finish(g);
}

// pórtico de teste: anel de câmeras + barra de varredura
export function testPortal() {
  const g = G();
  const w = 1.5;
  for (const x of [-w / 2, w / 2]) for (const z of [-0.8, 0.8]) g.add(box(M.anthracite, 0.09, 2.5, 0.09, x, 0, z));
  for (const z of [-0.8, 0.8]) g.add(box(M.anthracite, w, 0.09, 0.09, 0, 2.5, z));
  for (const x of [-w / 2, w / 2]) g.add(box(M.anthracite, 0.09, 0.09, 1.7, x, 2.5, 0));
  // câmeras
  for (const [x, y, z] of [[-w / 2, 1.9, 0.8], [w / 2, 1.9, 0.8], [-w / 2, 1.9, -0.8], [w / 2, 1.9, -0.8], [0, 2.45, 0]]) {
    g.add(rbox(M.dark, 0.1, 0.1, 0.16, x * 0.86, y, z * 0.86, 0.01));
    g.add(cyl(M.chrome, 0.03, 0.04, x * 0.8, y + 0.05, z * 0.72, 'z', 12));
  }
  const root = G();
  root.add(finish(g));
  const bar = G();
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.6, 1.0) });
  for (const z of [-0.74, 0.74]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.025, 0.025), ledMat);
    b.position.z = z;
    bar.add(b);
  }
  for (const x of [-w / 2 + 0.07, w / 2 - 0.07]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1.5), ledMat);
    b.position.x = x;
    bar.add(b);
  }
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.25, 1.46), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 1.4, 0.6), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  sheet.rotation.x = -Math.PI / 2;
  bar.add(sheet);
  root.add(bar);
  const mk = (title, rows, color) => {
    const p = panel(screenTexture(title, rows, { color }), 0.86, 0.54, { emissive: true, intensity: 1.5 });
    p.position.set(0, 2.95, 0.84);
    root.add(p);
    return p;
  };
  const scrRun = mk('TESTE FUNCIONAL', [['Basculante', 'em teste…'], ['Fechadura', 'aguardando'], ['Visão 3D', 'aguardando']], '#ffb03a');
  const scrOk = mk('TESTE FUNCIONAL', [['Basculante', 'OK', 1], ['Fechadura', 'OK', 1], ['Visão 3D', 'APROVADO', 1]], '#39d98a');
  root.add(box(M.anthracite, 0.92, 0.6, 0.04, 0, 2.66, 0.815));
  return { group: root, bar, scrRun, scrOk };
}

// caixa de papelão da embalagem (0,47 × 1,10 × 0,44 m); origem na base
export function cartonBox() {
  const front = new THREE.MeshStandardMaterial({ map: cartonTexture('front'), roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ map: cartonTexture('side'), roughness: 0.85 });
  const top = new THREE.MeshStandardMaterial({ color: '#c59a62', roughness: 0.85 });
  const geo = new THREE.BoxGeometry(0.47, 1.1, 0.44);
  geo.translate(0, 0.55, 0);
  return { geo, mats: [side, side, top, top, front, front] };
}

export function cartonGantry() {
  const g = G();
  const w = 1.7;
  for (const x of [-w / 2, w / 2]) for (const z of [-0.9, 0.9]) g.add(box(M.light, 0.1, 3.3, 0.1, x, 0, z));
  for (const z of [-0.9, 0.9]) g.add(box(M.light, w, 0.1, 0.1, 0, 3.3, z));
  for (const x of [-w / 2, w / 2]) g.add(box(M.light, 0.1, 0.1, 1.9, x, 3.3, 0));
  g.add(box(M.safety, 0.2, 0.16, 1.9, 0, 3.36, 0));
  // magazine de caixas desmontadas
  g.add(box(M.light, 1.0, 0.1, 0.8, w / 2 + 0.8, 0, -0.3));
  g.add(box(new THREE.MeshStandardMaterial({ color: '#c59a62', roughness: 0.9 }), 0.94, 0.5, 0.6, w / 2 + 0.8, 0.1, -0.3));
  // arco da cintadeira
  for (const z of [-0.42, 0.42]) g.add(box(M.blue, 0.1, 1.5, 0.08, -w / 2 + 0.25, 0.42, z));
  g.add(box(M.blue, 0.1, 0.08, 0.92, -w / 2 + 0.25, 1.92, 0));
  g.add(rbox(M.blue, 0.4, 0.4, 0.3, -w / 2 + 0.25, 0, -0.75, 0.02));
  const root = G();
  root.add(finish(g));
  const slide = G();
  slide.add(box(M.steel, 0.1, 1.9, 0.1, 0, 0.1, 0));
  slide.add(box(M.alu, 0.56, 0.05, 0.5, 0, 0.05, 0));
  for (const [x, z] of [[0.2, 0.18], [-0.2, 0.18], [0.2, -0.18], [-0.2, -0.18]]) slide.add(cyl(M.rubber, 0.035, 0.05, x, 0, z, 'y', 12));
  root.add(shadows(slide));
  return { group: root, slide };
}

export function woodPallet() {
  const g = G();
  for (const z of [-0.44, 0, 0.44]) g.add(box(M.wood, 1.2, 0.09, 0.1, 0, 0, z));
  for (let i = 0; i < 7; i++) g.add(box(M.wood, 0.14, 0.022, 1.0, -0.53 + i * 0.1767, 0.09, 0));
  for (const z of [-0.44, 0, 0.44]) g.add(box(M.wood, 1.2, 0.022, 0.1, 0, -0.022, z));
  const b = shadows(bake(g));
  b.position.y = 0.022;
  const root = G();
  root.add(b);
  root.userData.top = 0.134;
  return root;
}

// envolvedora de filme: plataforma giratória + mastro com carro do filme
export function wrapper() {
  const g = G();
  g.add(cyl(M.anthracite, 0.95, 0.07, 0, 0, 0, 'y', 40));
  g.add(box(M.anthracite, 0.5, 0.07, 1.1, 0, 0, 1.3));
  g.add(rbox(M.light, 0.34, 2.5, 0.3, 0, 0.07, 1.6, 0.03));
  g.add(box(M.orange, 0.345, 0.08, 0.305, 0, 2.2, 1.6));
  const root = G();
  root.add(finish(g));
  const table = G();
  table.add(cyl(M.steel, 0.9, 0.025, 0, 0.07, 0, 'y', 40));
  table.add(cyl(M.hazard, 0.9, 0.006, 0, 0.094, 0, 'y', 40));
  root.add(shadows(table));
  const car = G();
  car.add(rbox(M.anthracite, 0.3, 0.6, 0.16, 0, -0.3, 1.38, 0.02));
  car.add(cyl(M.light, 0.06, 0.52, 0, -0.26, 1.24, 'y', 14));
  root.add(shadows(car));
  return { group: root, table, car };
}

export function palletMagazine() {
  const g = G();
  for (const x of [-0.7, 0.7]) for (const z of [-0.6, 0.6]) g.add(box(M.blue, 0.08, 1.7, 0.08, x, 0, z));
  for (const z of [-0.6, 0.6]) g.add(box(M.blue, 1.48, 0.08, 0.08, 0, 1.7, z));
  for (let i = 0; i < 7; i++) {
    for (const z of [-0.44, 0, 0.44]) g.add(box(M.wood, 1.2, 0.09, 0.1, 0, 0.2 + i * 0.145, z));
    g.add(box(M.wood, 1.2, 0.022, 1.0, 0, 0.29 + i * 0.145, 0));
  }
  return finish(g);
}

// ---------- veículos ----------
export function forklift() {
  const root = G();
  const g = G();
  g.add(rbox(M.orange, 1.05, 0.62, 1.5, 0, 0.2, -0.25, 0.08, 4)); // corpo (frente = +z)
  g.add(rbox(M.anthracite, 1.0, 0.6, 0.5, 0, 0.3, -1.0, 0.1, 4)); // contrapeso
  g.add(rbox(M.dark, 0.5, 0.5, 0.5, 0, 0.82, -0.45, 0.06)); // banco
  g.add(rbox(M.dark, 0.5, 0.12, 0.44, 0, 0.82, -0.3, 0.04));
  // proteção do operador
  for (const [x, z] of [[-0.45, 0.35], [0.45, 0.35], [-0.45, -0.75], [0.45, -0.75]]) g.add(box(M.dark, 0.05, 1.3, 0.05, x, 0.8, z));
  g.add(box(M.dark, 1.0, 0.05, 1.2, 0, 2.1, -0.2));
  g.add(cyl(M.dark, 0.16, 0.03, 0, 1.2, 0.2, 'z', 16)); // volante
  for (const sx of [-1, 1]) {
    g.add(cyl(M.rubber, 0.26, 0.2, sx * 0.5, 0.26, 0.35, 'x', 20));
    g.add(cyl(M.safety, 0.12, 0.21, sx * 0.5, 0.26, 0.35, 'x', 12));
    g.add(cyl(M.rubber, 0.2, 0.16, sx * 0.44, 0.2, -0.95, 'x', 18));
  }
  g.add(cyl(M.ledAmber, 0.05, 0.07, 0.35, 2.15, -0.6, 'y', 12)); // giroflex
  root.add(shadows(bake(g)));
  // torre
  const mast = G();
  for (const x of [-0.3, 0.3]) mast.add(box(M.anthracite, 0.08, 2.1, 0.1, x, 0.08, 0.62));
  mast.add(box(M.anthracite, 0.68, 0.08, 0.1, 0, 2.1, 0.62));
  mast.add(box(M.anthracite, 0.68, 0.08, 0.1, 0, 0.9, 0.62));
  mast.add(cyl(M.chrome, 0.03, 1.6, 0, 0.2, 0.6, 'y', 10));
  root.add(shadows(mast));
  const forks = G();
  forks.add(box(M.dark, 0.9, 0.5, 0.05, 0, 0, 0.7));
  for (const x of [-0.25, 0.25]) {
    forks.add(box(M.iron, 0.1, 0.04, 1.15, x, 0, 1.28));
    forks.add(box(M.iron, 0.1, 0.5, 0.04, x, 0, 0.72));
  }
  forks.position.y = 0.06;
  root.add(shadows(forks));
  return { group: root, forks };
}

// caminhão com baú aberto na lateral (sider). Frente = +z. Carroceria: piso em y = 1.1
// open: +1 abre a lateral +x, −1 abre a lateral −x. bedL: comprimento da carroceria.
export function truck({ bedL = 3.9, open = 1, flat = false } = {}) {
  const g = G();
  const bedY = 1.1,
    bedW = 2.45;
  const zc = 2.0 - bedL / 2; // centro da carroceria (a cabine fica à frente, em +z)
  // chassi + rodas
  g.add(box(M.dark, 0.9, 0.22, bedL + 2.4, 0, 0.62, zc + 0.85));
  for (const [z, dual] of [[2.9, false], [zc - bedL / 2 + 1.0, true]]) {
    for (const sx of [-1, 1]) {
      g.add(cyl(M.rubber, 0.48, dual ? 0.52 : 0.28, sx * (bedW / 2 - (dual ? 0.26 : 0.14)), 0.48, z, 'x', 24));
      g.add(cyl(M.galv, 0.24, (dual ? 0.52 : 0.28) + 0.02, sx * (bedW / 2 - (dual ? 0.26 : 0.14)), 0.48, z, 'x', 14));
    }
    g.add(cyl(M.iron, 0.07, bedW - 0.4, 0, 0.48, z, 'x', 10));
  }
  // cabine
  g.add(rbox(M.white, 2.3, 1.75, 1.8, 0, 0.75, 3.1, 0.14, 5));
  g.add(rbox(M.dark, 2.32, 0.35, 0.3, 0, 0.55, 3.92, 0.05)); // para-choque
  const glass = M.glass.clone();
  glass.opacity = 0.5;
  glass.color.set('#22303a');
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.75), glass);
  ws.position.set(0, 1.95, 4.012);
  g.add(ws);
  for (const sx of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.65), glass);
    sw.position.set(sx * 1.157, 1.95, 3.3);
    sw.rotation.y = (sx * Math.PI) / 2;
    g.add(sw);
    g.add(box(M.lamp, 0.3, 0.14, 0.02, sx * 0.85, 0.95, 4.01)); // faróis
    g.add(box(M.dark, 0.06, 0.3, 0.14, sx * 1.3, 1.9, 3.75)); // retrovisores
  }
  g.add(box(M.orange, 2.31, 0.12, 1.81, 0, 1.25, 3.1));
  // carroceria: piso, frontal, teto e colunas (uma lateral aberta) ou carga seca aberta (flat)
  g.add(box(M.iron, bedW, 0.14, bedL, 0, bedY - 0.14, zc));
  g.add(box(M.wood, bedW - 0.06, 0.02, bedL - 0.06, 0, bedY, zc));
  if (flat) {
    g.add(rbox(M.white, bedW, 1.2, 0.08, 0, bedY, zc + bedL / 2 - 0.04, 0.01));
    g.add(box(M.light, 0.06, 0.35, bedL, (-open * bedW) / 2 + open * 0.03, bedY, zc));
    for (const z of [zc - bedL / 2 + 0.05, zc + bedL / 2 - 0.05]) g.add(box(M.light, 0.08, 0.6, 0.08, (-open * bedW) / 2 + open * 0.04, bedY, z));
  } else {
    g.add(rbox(M.white, bedW, 2.3, 0.08, 0, bedY, zc + bedL / 2 - 0.04, 0.01));
    g.add(rbox(M.white, bedW, 2.3, 0.08, 0, bedY, zc - bedL / 2 + 0.04, 0.01));
    g.add(rbox(M.white, bedW, 0.08, bedL, 0, bedY + 2.3, zc, 0.01));
    g.add(rbox(M.white, 0.06, 2.3, bedL, (-open * bedW) / 2 + open * 0.03, bedY, zc, 0.01)); // lateral fechada
    g.add(box(M.orange, 0.065, 0.3, bedL, (-open * bedW) / 2 + open * 0.03, bedY + 1.0, zc));
    for (const z of [zc - bedL / 2 + 0.05, zc + bedL / 2 - 0.05]) g.add(box(M.light, 0.08, 2.3, 0.08, (open * bedW) / 2 - open * 0.04, bedY, z));
    g.add(cyl(M.blue, 0.09, bedL - 0.1, (open * bedW) / 2 - open * 0.06, bedY + 2.22, zc, 'z', 12)); // lona recolhida
  }
  g.add(box(M.red, 0.3, 0.12, 0.03, -0.9, bedY - 0.3, zc - bedL / 2 - 0.01)); // lanternas
  g.add(box(M.red, 0.3, 0.12, 0.03, 0.9, bedY - 0.3, zc - bedL / 2 - 0.01));
  const root = G();
  root.add(shadows(bake(g)));
  root.userData.bed = { y: bedY + 0.02, zc, len: bedL };
  return root;
}

// ---------- adereços ----------
export function toolCabinet() {
  const g = G();
  g.add(rbox(M.blue, 0.9, 1.0, 0.5, 0, 0.1, 0, 0.02));
  for (let i = 0; i < 5; i++) g.add(box(M.dark, 0.6, 0.012, 0.01, 0, 0.26 + i * 0.17, 0.252));
  for (const x of [-0.38, 0.38]) for (const z of [-0.18, 0.18]) g.add(cyl(M.rubber, 0.05, 0.04, x, 0.05, z, 'x', 10));
  g.add(box(M.wood, 0.92, 0.03, 0.52, 0, 1.1, 0));
  return finish(g);
}
export function partsPallet(color = M.blue) {
  const g = G();
  g.add(woodPallet());
  for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) g.add(rbox(color, 0.56, 0.4, 0.46, x, 0.134, z, 0.02));
  return finish(g);
}
export function cone() {
  const g = G();
  g.add(box(M.dark, 0.3, 0.03, 0.3, 0, 0, 0));
  g.add(cyl(M.orange, 0.11, 0.5, 0, 0.03, 0, 'y', 14, 0.025));
  g.add(cyl(M.white, 0.075, 0.1, 0, 0.25, 0, 'y', 14, 0.052));
  return finish(g);
}
export function hangSign(title, sub, color = '#1f4fa3') {
  const g = G();
  const t = signTexture([title, sub], { w: 1024, h: 256, bg: color, size: 96, sub: 40 });
  for (const s of [1, -1]) {
    const p = panel(t, 3.2, 0.8);
    p.position.z = s * 0.03;
    if (s < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  g.add(box(M.anthracite, 3.26, 0.86, 0.04, 0, -0.43, 0));
  for (const x of [-1.3, 1.3]) g.add(cyl(M.dark, 0.008, 3.6, x, 0.43, 0, 'y', 6));
  g.traverse((o) => o.isMesh && (o.castShadow = false));
  return g;
}

// ---------- armazenagem ----------
// fardo de chapas (3,0 m ao longo de Z) sobre dois calços, com cintas
export function sheetBundle(h = 0.12) {
  const g = G();
  for (const z of [-1.05, 1.05]) g.add(box(M.wood, 1.3, 0.08, 0.1, 0, 0, z));
  g.add(box(M.sheet, 1.5, h, 3.0, 0, 0.08, 0));
  for (const z of [-0.9, 0.9]) g.add(box(M.dark, 1.51, h + 0.004, 0.03, 0, 0.079, z));
  const out = shadows(bake(g));
  out.userData.h = 0.08 + h;
  return out;
}

// estante cantilever para chapas: colunas atrás (z = +0,85) e braços para a frente (−z).
// levels: alturas dos braços; filled: quais níveis já têm fardo (o fardo fica com 3 m ao longo de X)
export function cantileverRack(levels, filled = [], label = '') {
  const g = G();
  const H = levels[levels.length - 1] + 0.9;
  for (const x of [-1.25, 0, 1.25]) {
    g.add(box(M.rackBlue, 0.14, H, 0.2, x, 0, 0.85));
    g.add(box(M.rackBlue, 0.16, 0.1, 1.9, x, 0, 0));
    for (const y of levels) {
      g.add(box(M.rackOrange, 0.1, 0.1, 1.6, x, y - 0.1, -0.05));
      g.add(box(M.rackOrange, 0.1, 0.07, 0.05, x, y, -0.83));
    }
  }
  for (const y of [0.5, H - 0.3]) g.add(box(M.rackBlue, 2.6, 0.08, 0.06, 0, y, 0.93));
  g.add(beam(M.rackBlue, [-1.25, 0.5, 0.93], [0, H - 0.3, 0.93], 0.05));
  g.add(beam(M.rackBlue, [1.25, 0.5, 0.93], [0, H - 0.3, 0.93], 0.05));
  levels.forEach((y, i) => {
    if (!filled[i]) return;
    const b = sheetBundle(typeof filled[i] === 'number' ? filled[i] : 0.12);
    b.rotation.y = Math.PI / 2;
    b.position.set(0, y, 0);
    g.add(b);
  });
  if (label) {
    const lg = panel(signTexture([label], { w: 512, h: 128, bg: '#16335f', size: 60 }), 1.1, 0.275);
    lg.position.set(0, H - 0.1, 0.96);
    lg.rotation.y = Math.PI;
    g.add(lg);
    const lf = panel(signTexture([label], { w: 512, h: 128, bg: '#16335f', size: 60 }), 1.1, 0.275);
    lf.position.set(0, H + 0.02, 0.74);
    g.add(lf);
  }
  return finish(g);
}

// cargas paletizadas do almoxarifado
export function load(kind) {
  const g = G();
  g.add(woodPallet());
  const y0 = 0.134;
  if (kind === 'drums') {
    for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) {
      g.add(cyl(M.drum, 0.27, 0.86, x, y0, z, 'y', 18));
      g.add(cyl(M.dark, 0.275, 0.02, x, y0 + 0.28, z, 'y', 18));
      g.add(cyl(M.dark, 0.275, 0.02, x, y0 + 0.58, z, 'y', 18));
    }
  } else if (kind === 'powder') {
    // caixas de tinta em pó (20 kg) com etiqueta laranja
    for (let k = 0; k < 3; k++)
      for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) {
        g.add(rbox(M.carton, 0.56, 0.28, 0.44, x, y0 + k * 0.285, z, 0.01));
        g.add(box(M.orange, 0.2, 0.12, 0.445, x, y0 + k * 0.285 + 0.08, z));
      }
  } else if (kind === 'wire') {
    // carretéis de arame de solda em caixas
    for (let k = 0; k < 4; k++)
      for (const x of [-0.39, 0, 0.39])
        for (const z of [-0.26, 0.26]) {
          g.add(rbox(M.cartonDark, 0.35, 0.2, 0.42, x, y0 + k * 0.205, z, 0.008));
          g.add(box(M.red, 0.351, 0.06, 0.1, x, y0 + k * 0.205 + 0.07, z));
        }
  } else if (kind === 'film') {
    for (const x of [-0.4, -0.13, 0.14, 0.41]) for (const z of [-0.3, 0, 0.3]) g.add(cyl(M.white, 0.12, 0.5, x, y0, z, 'y', 14));
    for (const x of [-0.4, -0.13, 0.14, 0.41]) for (const z of [-0.3, 0, 0.3]) g.add(cyl(M.cartonDark, 0.04, 0.52, x, y0, z, 'y', 8));
  } else if (kind === 'flats') {
    // caixas de papelão desmontadas, em fardos
    for (let k = 0; k < 4; k++) {
      g.add(box(k % 2 ? M.carton : M.cartonDark, 1.14, 0.2, 0.94, 0, y0 + k * 0.205, 0));
      g.add(box(M.dark, 1.145, 0.202, 0.02, 0, y0 + k * 0.205, 0.2));
    }
  } else if (kind === 'totes') {
    // caixas plásticas de componentes
    for (let k = 0; k < 3; k++)
      for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) g.add(rbox((k + (x > 0 ? 1 : 0)) % 2 ? M.blue : M.light, 0.56, 0.3, 0.44, x, y0 + k * 0.31, z, 0.02));
  } else if (kind === 'boxes') {
    for (let k = 0; k < 2; k++) for (const [x, z] of [[-0.3, 0], [0.3, 0]]) g.add(rbox(M.carton, 0.56, 0.42, 0.9, x, y0 + k * 0.43, z, 0.01));
  } else if (kind === 'straps') {
    // bobinas de cinta
    for (const x of [-0.3, 0.3]) for (let k = 0; k < 3; k++) g.add(cyl(M.plastic, 0.26, 0.16, x, y0 + k * 0.17, 0, 'y', 20));
    for (const x of [-0.3, 0.3]) g.add(cyl(M.cartonDark, 0.1, 0.52, x, y0, 0, 'y', 12));
  } else if (kind === 'pallets') {
    for (let k = 1; k < 6; k++) {
      const p = woodPallet();
      p.position.y = k * 0.145;
      g.add(p);
    }
  }
  return g;
}

// palete de produto acabado: 4 caixas (um material só, para fundir em poucas malhas) + filme
let fgMats = null;
export function finishedPallet() {
  fgMats ??= {
    box: new THREE.MeshStandardMaterial({ map: cartonTexture('front'), roughness: 0.85 }),
    film: new THREE.MeshPhysicalMaterial({ color: '#dfeaf2', roughness: 0.15, transparent: true, opacity: 0.3, depthWrite: false, clearcoat: 1 }),
    strap: new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.5 }),
  };
  const g = G();
  g.add(woodPallet());
  for (const [dx, dz] of [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.24], [0.26, 0.24]]) {
    g.add(box(fgMats.box, 0.47, 1.1, 0.44, dx, 0.134, dz));
    for (const y of [0.3, 0.8]) g.add(box(fgMats.strap, 0.476, 0.016, 0.446, dx, 0.134 + y, dz));
  }
  const f = box(fgMats.film, 1.03, 1.16, 0.96, 0, 0.134, 0);
  f.userData.noShadow = true;
  g.add(f);
  return g;
}

// porta-paletes ao longo de X, com a frente em +z. fill(bay, level, pos) devolve a carga (ou null).
export function palletRack({ bays = 3, bayW = 2.7, levels = [0, 1.5, 3.0], depth = 1.1, fill = () => null, loadYaw = 0 } = {}) {
  const g = G();
  const H = levels[levels.length - 1] + 1.55;
  const L = bays * bayW;
  for (let b = 0; b <= bays; b++) {
    const x = -L / 2 + b * bayW;
    for (const z of [-depth / 2, depth / 2]) {
      g.add(box(M.rackBlue, 0.09, H, 0.07, x, 0, z));
      g.add(box(M.iron, 0.14, 0.012, 0.12, x, 0, z));
    }
    for (let y = 0.3; y < H - 0.2; y += 1.1) g.add(beam(M.rackBlue, [x, y, -depth / 2], [x, y + 0.9, depth / 2], 0.03));
    g.add(box(M.safety, 0.14, 0.4, 0.14, x, 0, depth / 2 + 0.02)); // protetor de coluna
  }
  for (let b = 0; b < bays; b++) {
    const xc = -L / 2 + (b + 0.5) * bayW;
    levels.forEach((y, li) => {
      if (y > 0) for (const z of [-depth / 2, depth / 2]) g.add(box(M.rackOrange, bayW - 0.09, 0.11, 0.05, xc, y - 0.11, z));
      for (const pos of [0, 1]) {
        const ld = fill(b, li, pos);
        if (!ld) continue;
        ld.position.set(xc + (pos ? 0.66 : -0.66), y, 0);
        ld.rotation.y = loadYaw;
        g.add(ld);
      }
    });
  }
  return finish(g);
}

// estante leve com caixas (itens de reposição e componentes miúdos)
export function binShelving(w = 2.4, h = 2.2, shelves = 5) {
  const g = G();
  for (const x of [-w / 2, w / 2]) for (const z of [-0.25, 0.25]) g.add(box(M.light, 0.04, h, 0.04, x, 0, z));
  const cols = [M.blue, M.red, M.safety, M.green, M.light];
  for (let i = 0; i < shelves; i++) {
    const y = 0.12 + (i * (h - 0.3)) / (shelves - 1);
    g.add(box(M.galv, w, 0.02, 0.52, 0, y, 0));
    const n = Math.floor(w / 0.3);
    for (let k = 0; k < n; k++) {
      const m = i === shelves - 1 ? M.carton : cols[(k + i * 2) % cols.length];
      const hh = i === shelves - 1 ? 0.26 : 0.16;
      g.add(rbox(m, 0.26, hh, 0.4, -w / 2 + 0.17 + k * ((w - 0.34) / (n - 1)), y + 0.02, 0.02, 0.012));
    }
  }
  return finish(g);
}

// gaiola de cilindros de gás (mistura de solda e nitrogênio)
export function gasCage() {
  const g = G();
  g.add(box(M.iron, 1.6, 0.04, 1.9, 0, 0, 0));
  for (let i = 0; i < 4; i++)
    for (let k = 0; k < 3; k++) {
      const x = -0.5 + i * 0.33,
        z = -0.55 + k * 0.5;
      const m = i < 2 ? M.gasGreen : M.gasGray;
      g.add(cyl(m, 0.115, 1.35, x, 0.04, z, 'y', 14));
      g.add(cyl(m, 0.06, 0.12, x, 1.39, z, 'y', 10, 0.03));
      g.add(cyl(M.dark, 0.035, 0.1, x, 1.5, z, 'y', 8));
    }
  const root = G();
  root.add(finish(g));
  root.add(fenceRun([[-0.8, -0.95], [0.8, -0.95], [0.8, 0.95], [-0.8, 0.95], [-0.8, -0.95]], 1.9));
  const lg = panel(signTexture(['GASES'], { w: 512, h: 128, bg: '#b3261e', size: 70 }), 0.9, 0.225);
  lg.position.set(0, 2.05, 0.97);
  root.add(lg);
  return root;
}

// mesa de recebimento com computador e balança de piso
export function receivingDesk() {
  const g = G();
  g.add(rbox(M.light, 1.4, 0.04, 0.7, 0, 1.0, 0, 0.01));
  for (const x of [-0.62, 0.62]) for (const z of [-0.28, 0.28]) g.add(box(M.light, 0.05, 1.0, 0.05, x, 0, z));
  g.add(rbox(M.dark, 0.5, 0.32, 0.03, -0.2, 1.14, -0.1, 0.01));
  g.add(box(M.dark, 0.06, 0.1, 0.06, -0.2, 1.04, -0.1));
  g.add(rbox(M.carton, 0.3, 0.2, 0.25, 0.4, 1.04, 0, 0.01));
  g.add(box(M.iron, 1.5, 0.06, 1.5, 2.0, 0, 0.3)); // balança
  g.add(box(M.hazard, 1.5, 0.004, 0.1, 2.0, 0.06, -0.4));
  return finish(g);
}

// mesa de recortes do laser (duas zonas: pilha separada e posição de pega da dobradeira)
export function blankTable(w = 1.3, d = 2.3, h = 0.86) {
  const g = G();
  g.add(box(M.iron, w, 0.04, d, 0, h - 0.04, 0));
  g.add(box(M.anthracite, w - 0.1, 0.1, d - 0.1, 0, h - 0.14, 0));
  for (const x of [-w / 2 + 0.07, w / 2 - 0.07]) for (const z of [-d / 2 + 0.07, 0, d / 2 - 0.07]) g.add(box(M.anthracite, 0.08, h - 0.14, 0.08, x, 0, z));
  g.add(box(M.hazard, w, 0.006, 0.05, 0, h, 0)); // divisão das zonas
  return finish(g);
}

// mesa de solda perfurada com batentes
export function weldTable(w = 1.5, d = 1.1, h = 0.8) {
  const g = G();
  g.add(box(M.iron, w, 0.06, d, 0, h - 0.06, 0));
  g.add(box(M.dark, w - 0.06, 0.004, d - 0.06, 0, h, 0));
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) g.add(box(M.blue, 0.09, h - 0.06, 0.09, x, 0, z));
  g.add(box(M.blue, w - 0.16, 0.07, 0.07, 0, 0.2, -d / 2 + 0.08));
  g.add(box(M.blue, w - 0.16, 0.07, 0.07, 0, 0.2, d / 2 - 0.08));
  for (const [x, z] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06]]) g.add(box(M.safety, 0.05, 0.07, 0.05, x, h, z));
  return finish(g);
}

// carrinho baixo de peças (entrada e saída das células)
export function partsCart(w = 1.1, d = 0.8) {
  const g = G();
  g.add(rbox(M.blue, w, 0.06, d, 0, 0.16, 0, 0.012));
  for (const x of [-w / 2 + 0.09, w / 2 - 0.09]) for (const z of [-d / 2 + 0.09, d / 2 - 0.09]) g.add(cyl(M.rubber, 0.07, 0.05, x, 0.07, z, 'x', 12));
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) g.add(box(M.blue, 0.035, 0.75, 0.035, x, 0.22, -d / 2 + 0.03));
  g.add(box(M.blue, w, 0.035, 0.035, 0, 0.95, -d / 2 + 0.03));
  return finish(g);
}

// posto de medição de camada depois do resfriamento (pórtico baixo com sensores e tela)
export function thicknessCheck() {
  const g = G();
  for (const z of [-0.85, 0.85]) {
    g.add(box(M.anthracite, 0.09, 3.3, 0.09, 0, 0, z));
    g.add(box(M.iron, 0.3, 0.015, 0.3, 0, 0, z));
    for (const y of [1.9, 2.3, 2.7]) g.add(rbox(M.dark, 0.1, 0.1, 0.22, 0, y, z * 0.86, 0.01));
  }
  g.add(box(M.anthracite, 0.09, 0.09, 1.8, 0, 3.3, 0));
  const root = G();
  root.add(finish(g));
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 2.8) });
  for (const z of [-0.74, 0.74]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.1, 0.02), led);
    b.position.set(0, 2.3, z);
    root.add(b);
  }
  const sc = panel(screenTexture('CAMADA DE TINTA', [['Média', '72 µm', 0.72], ['Mínima', '64 µm', 0.64], ['Cura', 'OK', 1]], { color: '#39d98a' }), 0.8, 0.5, { emissive: true, intensity: 1.5 });
  sc.position.set(0, 1.5, 1.0);
  root.add(sc);
  root.add(shadows(new THREE.Group().add(box(M.anthracite, 0.86, 0.56, 0.04, 0, 1.22, 0.975), box(M.anthracite, 0.07, 1.22, 0.07, 0, 0, 0.975))));
  return root;
}
