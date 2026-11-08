// Mini sistema de tweens dirigido pelo loop de render.
const active = new Set();

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => {
    const c1 = 1.4,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export function tween(duration, onUpdate, easing = ease.inOutCubic) {
  return new Promise((resolve) => {
    active.add({ t: 0, duration: Math.max(duration, 1e-4), onUpdate, easing, resolve });
  });
}

export function wait(seconds) {
  return tween(seconds, () => {});
}

export function updateTweens(dt) {
  for (const tw of active) {
    tw.t += dt;
    const k = Math.min(tw.t / tw.duration, 1);
    tw.onUpdate(tw.easing(k), k);
    if (k >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}
