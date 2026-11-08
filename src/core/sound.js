// Efeitos sonoros sintetizados (sem arquivos de áudio).
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(v) {
  muted = v;
}
export function isMuted() {
  return muted;
}

function noiseBurst(duration, freq, q, gain) {
  const a = ac();
  if (!a || muted) return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

function tone(freq, duration, gain, type = 'sine', slideTo) {
  const a = ac();
  if (!a || muted) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + duration);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + duration);
}

export const sfx = {
  click: () => {
    noiseBurst(0.04, 3200, 4, 0.5);
    tone(1800, 0.04, 0.08, 'square');
  },
  lock: () => {
    noiseBurst(0.05, 2400, 3, 0.6);
    setTimeout(() => noiseBurst(0.06, 1500, 3, 0.6), 70);
  },
  thud: (strength = 1) => {
    tone(110, 0.18, 0.35 * strength, 'sine', 55);
    noiseBurst(0.12, 400, 1.2, 0.5 * strength);
  },
  metal: () => {
    noiseBurst(0.08, 900, 6, 0.35);
    tone(420, 0.12, 0.05, 'triangle', 380);
  },
  deny: () => {
    noiseBurst(0.05, 700, 4, 0.5);
    setTimeout(() => noiseBurst(0.05, 700, 4, 0.5), 90);
  },
};
