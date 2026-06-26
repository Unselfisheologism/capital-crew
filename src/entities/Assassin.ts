/**
 * Capital Crew — ASSASSIN MODE
 *
 * Among Us-style social deduction layer on top of the economic game.
 * One (or more) of the AI is secretly an Assassin. The human sees an "ALERT" popup
 * when they enter Assassin's zone. The Assassin stalks the player, with a stealth
 * meter that fills while they're in range. If it maxes out, the Assassin strikes
 * and bleeds the player's cash.
 *
 * Features:
 *   - Assassin is randomly chosen each game from AI personalities
 *   - Stealth meter is invisible to victim until they enter Assassin's view
 *   - "Proximity Alert" toast flashes when victim enters Assassin's zone
 *   - Assassin can fake economic actions to blend in (do real moves too)
 *   - On stealth > 100%, BANDIT KILL: steal 30% of victim's cash, victim survives
 *   - Kill cooldown of 60s per assassin per victim
 *   - Victim can AVOID by leaving the zone or paying off the assassin (Offer $500)
 *   - HUD shows risk meter (top-center) when stealth > 0
 */
import Phaser from 'phaser';
import { PlayerState } from '../state/PlayerState';
import { ZONES } from '../data/Properties';
import { AIPlayer, Personality } from './AIPlayer';

export interface AssassinState {
  id: string;
  name: string;
  color: number;
  /** Stealth fill 0..1.0+ per victim. */
  stealth: number;
  /** Per-victim cooldown until: timestamps. */
  lastKillMs: number;
  /** Who have they killed. */
  victims: string[];
}

export const ASSASSIN_KILL_PCT = 0.3; // take 30% of victim cash
export const ASSASSIN_STEALTH_RATE = 0.012; // per tick of contact
export const ASSASSIN_KILL_COOLDOWN_MS = 60_000;
export const ASSASSIN_VIEW_RADIUS = 220;
export const ASSASSIN_DETECT_RANGE = 60; // how close human needs to be to start alert

export function assignAssassin(personalities: Personality[]): string {
  return personalities[Math.floor(Math.random() * personalities.length)].id;
}

/**
 * Check whether the human and the assassin ghost-shadow are within view distance
 * of each other on the map (ignoring walls — Among Us style).
 */
export function isInView(
  human: { x: number; y: number },
  ghost: { x: number; y: number },
): boolean {
  const dx = human.x - ghost.x;
  const dy = human.y - ghost.y;
  return dx * dx + dy * dy <= ASSASSIN_VIEW_RADIUS * ASSASSIN_VIEW_RADIUS;
}

export interface AssassinUI {
  overlay: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  cooldownBar: Phaser.GameObjects.Graphics;
}
