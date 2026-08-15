// Audio system: 100% synthesized sound effects via Web Audio (no asset
// files - original content by construction, design doc 26). Positional
// panning/gain for game sounds near the listener.

import { Vec3 } from '../core/math';

type SoundKind =
  | 'shot_pistol'
  | 'shot_rifle'
  | 'shot_smg'
  | 'shot_sniper'
  | 'shot_shotgun'
  | 'shot_mg'
  | 'reload'
  | 'footstep'
  | 'land'
  | 'explosion'
  | 'beep'
  | 'plant'
  | 'defuse'
  | 'win'
  | 'lose'
  | 'click'
  | 'hitmarker'
  | 'knife';

const SHOT_BY_CATEGORY: Record<string, SoundKind> = {
  pistol: 'shot_pistol',
  rifle: 'shot_rifle',
  smg: 'shot_smg',
  sniper: 'shot_sniper',
  shotgun: 'shot_shotgun',
  machinegun: 'shot_mg',
};

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.8;
  private lastPlayed = new Map<string, number>();

  /** Must be called from a user gesture (design doc 52.2). */
  init(): void {
    if (this.ctx) {
      this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // 1s white noise buffer reused by all noise-based sounds.
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private throttled(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlayed.get(key) ?? 0;
    if (now - last < ms) return true;
    this.lastPlayed.set(key, now);
    return false;
  }

  private env(peak: number, attack: number, decay: number, now: number, dest?: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    g.connect(dest ?? this.master!);
    return g;
  }

  private noiseBurst(now: number, dur: number, peak: number, filterType: BiquadFilterType, freq: number, q = 1, dest?: AudioNode): void {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.env(peak, 0.002, dur, now, dest);
    src.connect(filter);
    filter.connect(g);
    src.start(now, Math.random() * 0.5, dur + 0.05);
    src.stop(now + dur + 0.1);
  }

  private tone(now: number, freq: number, dur: number, peak: number, type: OscillatorType = 'sine', dest?: AudioNode): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    const g = this.env(peak, 0.004, dur, now, dest);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  /** Play a non-positional sound. */
  play(kind: SoundKind, volume = 1): void {
    if (!this.ctx) return;
    if (this.throttled(kind, 35)) return;
    const now = this.ctx.currentTime;
    const v = volume;
    switch (kind) {
      case 'shot_pistol':
        this.noiseBurst(now, 0.09, 0.5 * v, 'bandpass', 1400, 0.8);
        this.tone(now, 180, 0.06, 0.25 * v, 'square');
        break;
      case 'shot_rifle':
        this.noiseBurst(now, 0.12, 0.65 * v, 'bandpass', 900, 0.6);
        this.tone(now, 110, 0.09, 0.35 * v, 'square');
        break;
      case 'shot_smg':
        this.noiseBurst(now, 0.07, 0.45 * v, 'bandpass', 1800, 0.9);
        this.tone(now, 220, 0.05, 0.2 * v, 'square');
        break;
      case 'shot_sniper':
        this.noiseBurst(now, 0.25, 0.9 * v, 'lowpass', 2400, 0.5);
        this.tone(now, 70, 0.2, 0.5 * v, 'sawtooth');
        break;
      case 'shot_shotgun':
        this.noiseBurst(now, 0.2, 0.8 * v, 'lowpass', 1200, 0.5);
        this.tone(now, 90, 0.15, 0.4 * v, 'square');
        break;
      case 'shot_mg':
        this.noiseBurst(now, 0.14, 0.7 * v, 'bandpass', 700, 0.5);
        this.tone(now, 100, 0.1, 0.35 * v, 'square');
        break;
      case 'knife':
        this.noiseBurst(now, 0.08, 0.3 * v, 'highpass', 3000, 1);
        break;
      case 'reload':
        this.tone(now, 800, 0.03, 0.25 * v, 'square');
        this.tone(now + 0.12, 700, 0.03, 0.25 * v, 'square');
        this.tone(now + 0.24, 900, 0.04, 0.3 * v, 'square');
        break;
      case 'footstep':
        this.noiseBurst(now, 0.05, 0.18 * v, 'lowpass', 500, 1);
        break;
      case 'land':
        this.noiseBurst(now, 0.08, 0.25 * v, 'lowpass', 400, 1);
        break;
      case 'explosion':
        this.noiseBurst(now, 0.9, 0.9 * v, 'lowpass', 900, 0.4);
        this.tone(now, 55, 0.7, 0.5 * v, 'sine');
        this.noiseBurst(now + 0.05, 0.3, 0.6 * v, 'highpass', 1500, 1);
        break;
      case 'beep':
        this.tone(now, 950, 0.09, 0.35 * v, 'square');
        break;
      case 'plant':
        this.tone(now, 420, 0.08, 0.3 * v, 'square');
        this.tone(now + 0.1, 420, 0.08, 0.3 * v, 'square');
        break;
      case 'defuse':
        this.tone(now, 620, 0.06, 0.3 * v, 'square');
        this.tone(now + 0.08, 620, 0.06, 0.3 * v, 'square');
        break;
      case 'win':
        this.tone(now, 523, 0.25, 0.3 * v, 'triangle');
        this.tone(now + 0.15, 659, 0.25, 0.3 * v, 'triangle');
        this.tone(now + 0.3, 784, 0.4, 0.35 * v, 'triangle');
        break;
      case 'lose':
        this.tone(now, 392, 0.3, 0.3 * v, 'triangle');
        this.tone(now + 0.2, 330, 0.3, 0.3 * v, 'triangle');
        this.tone(now + 0.4, 262, 0.5, 0.35 * v, 'triangle');
        break;
      case 'click':
        this.tone(now, 1200, 0.03, 0.15 * v, 'square');
        break;
      case 'hitmarker':
        this.tone(now, 1800, 0.05, 0.2 * v, 'square');
        break;
    }
  }

  /**
   * Positional playback relative to a listener position/yaw.
   * Returns a gain multiplier the caller could reuse (kept simple: we just
   * attenuate and pan).
   */
  playAt(kind: SoundKind, pos: Vec3, listenerPos: Vec3, listenerYaw: number, maxDist = 60): void {
    if (!this.ctx || !this.master) return;
    const dx = pos.x - listenerPos.x;
    const dz = pos.z - listenerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist) return;
    const gain = Math.max(0, 1 - dist / maxDist);
    // Pan: angle between listener forward (-Z in world terms for yaw=0) and
    // the direction to the sound source.
    const forwardX = Math.sin(listenerYaw);
    const forwardZ = -Math.cos(listenerYaw);
    const dot = (dx * forwardX + dz * forwardZ) / (dist + 1e-6);
    const cross = dx * -forwardZ - dz * forwardX;
    const pan = Math.max(-1, Math.min(1, Math.asin(Math.max(-1, Math.min(1, cross))) * 0.9));
    // Route through a temporary panner.
    const now = this.ctx.currentTime;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    panner.connect(g);
    g.connect(this.master);
    this.playInto(kind, Math.max(0.02, gain), now, panner);
  }

  private playInto(kind: SoundKind, volume: number, now: number, dest: AudioNode): void {
    if (!this.ctx || !this.noise) return;
    const v = volume;
    switch (kind) {
      case 'shot_rifle':
      case 'shot_pistol':
      case 'shot_smg':
      case 'shot_sniper':
      case 'shot_shotgun':
      case 'shot_mg': {
        const map: Record<string, [number, number]> = {
          shot_pistol: [1400, 0.09],
          shot_rifle: [900, 0.12],
          shot_smg: [1800, 0.07],
          shot_sniper: [2400, 0.25],
          shot_shotgun: [1200, 0.2],
          shot_mg: [700, 0.14],
        };
        const [freq, dur] = map[kind];
        this.noiseBurst(now, dur, 0.6 * v, 'bandpass', freq, 0.7, dest);
        break;
      }
      case 'footstep':
        this.noiseBurst(now, 0.05, 0.18 * v, 'lowpass', 500, 1, dest);
        break;
      case 'explosion':
        this.noiseBurst(now, 0.9, 0.9 * v, 'lowpass', 900, 0.4, dest);
        break;
      case 'beep':
        this.tone(now, 950, 0.09, 0.35 * v, 'square', dest);
        break;
      default:
        break;
    }
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => undefined);
  }
}
