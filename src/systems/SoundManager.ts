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

  playKill(): void {
    this.playTone(160, 0.22, 'sawtooth', 0.22);
    setTimeout(() => this.playTone(90, 0.28, 'square', 0.2), 70);
  }

  playShake(): void {
    this.playTone(60, 0.14, 'triangle', 0.25);
    setTimeout(() => this.playTone(45, 0.12, 'triangle', 0.2), 80);
  }

  playAlert(): void {
    this.playTone(1200, 0.06, 'square', 0.14);
    setTimeout(() => this.playTone(800, 0.1, 'square', 0.12), 70);
  }

  playWin(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.playTone(f, 0.18, 'triangle', 0.14), i * 110),
    );
  }

  playLose(): void {
    this.playTone(300, 0.2, 'sawtooth', 0.18);
    setTimeout(() => this.playTone(200, 0.3, 'sawtooth', 0.15), 180);
  }

  playStreak(): void {
    this.playTone(900, 0.05, 'square', 0.1);
    setTimeout(() => this.playTone(1200, 0.07, 'square', 0.1), 50);
  }

  playVote(): void {
    this.playTone(600, 0.07, 'triangle', 0.12);
    setTimeout(() => this.playTone(900, 0.07, 'triangle', 0.12), 70);
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
