/**
 * Procedural sound manager — generates all game audio at runtime
 * using the Web Audio API. No audio files needed.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  public sfxVolume: number = 0.5;

  constructor() {
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  /** Resume AudioContext (browser autoplay policy) */
  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playClick(): void {
    this.playTone(800, 0.05, 'square', 0.12);
  }

  playCoin(): void {
    this.playTone(1200, 0.08, 'sine', 0.15);
  }

  playOpen(): void {
    this.playTone(600, 0.08, 'triangle', 0.12);
    setTimeout(() => this.playTone(900, 0.08, 'triangle', 0.08), 60);
  }

  playPurchase(): void {
    this.playTone(500, 0.06, 'sine', 0.12);
    setTimeout(() => this.playTone(800, 0.06, 'sine', 0.12), 80);
    setTimeout(() => this.playTone(1100, 0.1, 'sine', 0.15), 160);
  }

  playError(): void {
    this.playTone(200, 0.15, 'sawtooth', 0.18);
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    vol: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.ctx.currentTime + duration
    );
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
}

/** Singleton export */
export const soundManager = new SoundManager();
