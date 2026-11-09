import * as THREE from 'three';

// Acabamentos (pintura eletrostática / inox). body = laterais e estrutura,
// front = porta, basculante e testeira, cap = tampo e base, mech = mecanismo interno.
export const FINISHES = {
  grafite: {
    label: 'Grafite',
    code: 'RAL 7016 texturizado',
    body: '#3a4045',
    front: '#3a4045',
    cap: '#24282b',
    rough: 0.62,
    metal: 0.18,
    clearcoat: 0.15,
  },
  preto: {
    label: 'Preto fosco',
    code: 'RAL 9005 microtexturizado',
    body: '#1c1e20',
    front: '#1c1e20',
    cap: '#121314',
    rough: 0.72,
    metal: 0.12,
    clearcoat: 0.05,
  },
  branco: {
    label: 'Branco',
    code: 'RAL 9016 brilho',
    body: '#eef0ec',
    front: '#eef0ec',
    cap: '#d6d8d3',
    rough: 0.4,
    metal: 0.05,
    clearcoat: 0.4,
  },
  inox: {
    label: 'Inox escovado',
    code: 'AISI 304 escovado',
    body: '#c9cdd1',
    front: '#c9cdd1',
    cap: '#b4b8bc',
    rough: 0.3,
    metal: 1,
    clearcoat: 0,
    anisotropy: 0.7,
  },
  bicolor: {
    label: 'Grafite + Laranja',
    code: 'RAL 7016 / RAL 2004',
    body: '#3a4045',
    front: '#e8641f',
    cap: '#24282b',
    rough: 0.55,
    metal: 0.15,
    clearcoat: 0.2,
  },
  cad: {
    label: 'Cores do CAD',
    code: 'Esquema de cores do projeto',
    body: '#5fc0c0',
    front: '#e4dbd1',
    cap: '#b8b66c',
    mech: '#9a9db4',
    rough: 0.6,
    metal: 0,
    clearcoat: 0,
  },
};

function paint(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.6,
    metalness: 0.15,
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
  });
}

export function createMaterials() {
  const m = {
    body: paint('#3a4045'),
    shell: paint('#3a4045'), // laterais e fundo (ficam translúcidos no modo raio-X)
    front: paint('#3a4045'),
    cap: paint('#24282b'),
    mech: new THREE.MeshPhysicalMaterial({ color: '#b3b8bd', roughness: 0.42, metalness: 0.75 }),
    galv: new THREE.MeshPhysicalMaterial({ color: '#a9aeb3', roughness: 0.48, metalness: 0.8 }),
    chrome: new THREE.MeshPhysicalMaterial({ color: '#e6e8ea', roughness: 0.12, metalness: 1 }),
    brass: new THREE.MeshPhysicalMaterial({ color: '#c9a24c', roughness: 0.25, metalness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: '#0d0f10', roughness: 0.6, metalness: 0.2 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.92, metalness: 0 }),
    // vidro/acrílico fumê das portas (visor)
    smoke: new THREE.MeshPhysicalMaterial({
      color: '#1b2328',
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      depthWrite: false,
    }),
  };
  m.shell.side = THREE.DoubleSide;
  return m;
}

export function applyFinish(m, key) {
  const f = FINISHES[key];
  if (!f) return;
  for (const [name, color] of [
    ['body', f.body],
    ['shell', f.body],
    ['front', f.front],
    ['cap', f.cap],
  ]) {
    const mat = m[name];
    mat.color.set(color);
    mat.roughness = name === 'cap' ? Math.min(1, f.rough + 0.05) : f.rough;
    mat.metalness = f.metal;
    mat.clearcoat = f.clearcoat;
    mat.anisotropy = f.anisotropy ?? 0;
    mat.needsUpdate = true;
  }
  if (f.mech) {
    m.mech.color.set(f.mech);
    m.mech.metalness = 0;
    m.mech.roughness = 0.6;
  } else {
    m.mech.color.set('#b3b8bd');
    m.mech.metalness = 0.75;
    m.mech.roughness = 0.42;
  }
}

export function setXray(m, on) {
  const s = m.shell;
  s.transparent = on;
  s.opacity = on ? 0.14 : 1;
  s.depthWrite = !on;
  s.needsUpdate = true;
}
