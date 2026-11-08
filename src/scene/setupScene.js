import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createContactShadow } from '../locker/textures.js';

export function setupScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, container.clientWidth / container.clientHeight, 0.05, 50);
  camera.position.set(1.55, 1.25, 2.05);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.52, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.6;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotateSpeed = 0.8;
  controls.update();

  // Luzes
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c0c8, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(1.6, 2.8, 2.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -1;
  key.shadow.camera.right = 1;
  key.shadow.camera.top = 1.6;
  key.shadow.camera.bottom = -0.6;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 7;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  rim.position.set(-2, 1.6, -1.8);
  scene.add(rim);

  // Chão: recebe sombra + sombra de contato
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 0.72),
    new THREE.MeshBasicMaterial({ map: createContactShadow(), transparent: true, depthWrite: false, opacity: 0.85 })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.0008;
  scene.add(contact);

  const grid = new THREE.PolarGridHelper(2.4, 8, 6, 96, 0xc9d0d8, 0xd9dee4);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.position.y = 0.0004;
  scene.add(grid);

  function resize() {
    const w = container.clientWidth,
      h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  return { renderer, labelRenderer, scene, camera, controls, resize };
}
