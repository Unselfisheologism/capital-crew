import Phaser from 'phaser';
import { TICK_INTERVAL_MS } from '../data/Properties';

/**
 * Timer-driven game loop with a listener/observer pattern.
 * Keeps the timer system agnostic of game state.
 */
export class GameTick {
  private scene: Phaser.Scene;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private listeners: Array<() => void> = [];
  private running: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Register a callback fired on each tick */
  addListener(callback: () => void): void {
    this.listeners.push(callback);
  }

  /** Start the tick timer */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timerEvent = this.scene.time.addEvent({
      delay: TICK_INTERVAL_MS,
      callback: this.fire,
      callbackScope: this,
      loop: true,
    });
  }

  /** Stop the tick timer */
  stop(): void {
    this.running = false;
    if (this.timerEvent) {
      this.timerEvent.destroy();
      this.timerEvent = null;
    }
  }

  /** Force-fire a tick immediately */
  forceTick(): void {
    if (this.timerEvent) {
      this.fire();
    }
  }

  /** Seconds until the next scheduled tick */
  get timeUntilNextTick(): number {
    if (this.timerEvent) {
      return Math.ceil(this.timerEvent.getRemaining() / 1000);
    }
    return 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Clean up */
  destroy(): void {
    this.stop();
    this.listeners = [];
  }

  private fire(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }
}
