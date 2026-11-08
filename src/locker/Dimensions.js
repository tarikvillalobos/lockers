import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SPEC } from './spec.js';

// Cotas gerais (mm) desenhadas no referencial do locker.
export function createDimensions() {
  const group = new THREE.Group();
  group.name = 'Cotas';
  const color = 0xf2661c;
  const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
  const extMat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.45 });
  const coneMat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
  const coneGeo = new THREE.ConeGeometry(5, 20, 12);
  coneGeo.translate(0, -10, 0); // ponta na origem
  const labels = [];

  const seg = (mat, a, b) => {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, mat);
    l.renderOrder = 999;
    group.add(l);
  };

  const arrow = (tip, dir) => {
    const c = new THREE.Mesh(coneGeo, coneMat);
    c.position.copy(tip);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    c.renderOrder = 999;
    group.add(c);
  };

  // a, b: extremos no objeto; off: deslocamento da linha de cota
  const dim = (a, b, off, text) => {
    const A = a.clone().add(off);
    const B = b.clone().add(off);
    const n = off.clone().normalize();
    seg(extMat, a.clone().addScaledVector(n, 8), A.clone().addScaledVector(n, 14));
    seg(extMat, b.clone().addScaledVector(n, 8), B.clone().addScaledVector(n, 14));
    seg(lineMat, A, B);
    const dir = B.clone().sub(A).normalize();
    arrow(A, dir.clone().negate());
    arrow(B, dir);
    const el = document.createElement('div');
    el.className = 'dim-label';
    el.textContent = text;
    const lbl = new CSS2DObject(el);
    lbl.position.copy(A).add(B).multiplyScalar(0.5);
    group.add(lbl);
    labels.push(lbl);
  };

  const hx = SPEC.W / 2,
    hz = SPEC.D / 2,
    H = SPEC.H;
  dim(new THREE.Vector3(hx, 0, hz), new THREE.Vector3(hx, H, hz), new THREE.Vector3(70, 0, 0), `${H} mm`);
  dim(new THREE.Vector3(-hx, H, hz), new THREE.Vector3(hx, H, hz), new THREE.Vector3(0, 70, 0), `${SPEC.W} mm`);
  dim(new THREE.Vector3(-hx, H, hz), new THREE.Vector3(-hx, H, -hz), new THREE.Vector3(-70, 0, 0), `${SPEC.D} mm`);

  group.visible = false;
  return {
    group,
    setVisible(v) {
      group.visible = v;
      for (const l of labels) l.visible = v;
    },
  };
}
