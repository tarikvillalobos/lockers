// Partículas: faíscas (laser, solda) e nuvem de pó da pintura.
import * as THREE from 'three';
import { glowTexture } from './kit.js';

let sprite = null;

export class Particles {
  constructor(n, { size = 0.05, color = [3, 1.9, 0.7], gravity = -6, drag = 0.6, additive = true, opacity = 1 } = {}) {
    this.n = n;
    this.gravity = gravity;
    this.drag = drag;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.base = color;
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    sprite ??= glowTexture();
    const m = new THREE.PointsMaterial({
      size,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -100;
  }

  // emite `count` partículas em p, na direção dir (espalhamento `spread`), velocidade `speed`
  emit(p, dir, count, { speed = 2, spread = 0.6, life = 0.5 } = {}) {
    for (let k = 0; k < count; k++) {
      const i = this.i;
      this.i = (this.i + 1) % this.n;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = (dir.x + (Math.random() - 0.5) * 2 * spread) * s;
      this.vel[i * 3 + 1] = (dir.y + (Math.random() - 0.5) * 2 * spread) * s;
      this.vel[i * 3 + 2] = (dir.z + (Math.random() - 0.5) * 2 * spread) * s;
      this.life[i] = this.max[i] = life * (0.5 + Math.random() * 0.8);
    }
  }

  update(dt) {
    const { pos, vel, col, life, max, base } = this;
    const dr = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const j = i * 3;
      if (life[i] <= 0) {
        pos[j + 1] = -100;
        col[j] = col[j + 1] = col[j + 2] = 0;
        continue;
      }
      vel[j + 1] += this.gravity * dt;
      vel[j] *= dr;
      vel[j + 1] *= dr;
      vel[j + 2] *= dr;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      const f = Math.min(1, (life[i] / max[i]) * 1.6);
      col[j] = base[0] * f;
      col[j + 1] = base[1] * f * f;
      col[j + 2] = base[2] * f * f * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
