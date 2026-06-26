/**
 * Capital Crew — PLAYER SUB-ROLES
 *
 * Player chooses a sub-role at game start (replaces Among Us role pick).
 * Inspired by Among Us Crewmate specializations, adapted for a Monopoly-like
 * economic sandbox where movement and information are the key advantages.
 *
 * Roles:
 *
 *   ENGINEER:
 *     - Can teleport ("vent") between paired zones via the V key
 *       when standing on a vent (any of the 4 service zones).
 *     - 18s cooldown per vent.
 *     - 2 vent points per game — for Monopoly purposes (venting into property
 *       zones gives you a tactical fast-traverse shortcut).
 *
 *   TRACKER:
 *     - Can plant a "tracking pin" on any AI within 220px (TAP T+click while
 *       in tracker mode — see UI). After planting, a small minimap blip appears
 *       over the target at all times for 45 seconds.
 *     - 90s cooldown before another pin can be planted.
 *     - 3 pins per game.
 *     - Tracker's main advantage is information: knowing where AI assassins go.
 *
 *   TRADER (Monopoly-flavored role not in Among Us):
 *     - Day Job earnings +25% (cash multiplier).
 *     - Property purchases refunded 10% if sold within 5 ticks.
 *     - The classic Monopoly power broker.
 *
 * Each role has a definition, max uses, cooldowns, and effect IDs that the
 * game scene dispatches against.
 */
import Phaser from 'phaser';

export type RoleId = 'engineer' | 'tracker' | 'trader';

export interface RoleDef {
  id: RoleId;
  name: string;
  icon: string;
  shortDesc: string;
  desc: string;
  color: number;
  /** Number of uses available per game. Infinity → unlimited. */
  uses: number;
  /** Cooldown between uses (ms). */
  cooldownMs: number;
  /** Stat modifiers to baseline gameplay. */
  modifiers: {
    dayJobMultiplier?: number;
    sellRefundPct?: number; // 0..1
    pinDurationMs?: number;
    ventRange?: number;
  };
}

export const ROLES: RoleDef[] = [
  {
    id: 'engineer',
    name: 'Engineer',
    icon: '🔧',
    shortDesc: 'Vent teleport between paired zones',
    desc: 'Press V on a service zone to vent to another service zone. 18s cooldown. 2 vents per game.',
    color: 0xffa500,
    uses: 2,
    cooldownMs: 18_000,
    modifiers: { ventRange: 700 },
  },
  {
    id: 'tracker',
    name: 'Tracker',
    icon: '🎯',
    shortDesc: 'Pin an AI to track their movement for 45s',
    desc: 'Press Y near an AI to plant a tracking pin. Watch their moves for 45s. 90s cooldown. 3 pins.',
    color: 0x44ccff,
    uses: 3,
    cooldownMs: 90_000,
    modifiers: { pinDurationMs: 45_000 },
  },
  {
    id: 'trader',
    name: 'Trader',
    icon: '💰',
    shortDesc: 'Day Job +25%, sell-refund 10%',
    desc: 'Bonus stacker. Earn more from day work. Get partial refunds on property if sold quickly.',
    color: 0xffd700,
    uses: Infinity,
    cooldownMs: 0,
    modifiers: { dayJobMultiplier: 1.25, sellRefundPct: 0.1 },
  },
];

export interface ActivePin {
  pin: Phaser.GameObjects.Graphics;
  targetId: string;
  placedAt: number;
  durationMs: number;
  expiry: number;
}

/** V key pressed flag, mirrors E/H/T pattern. */
export const V_PRESSED_RESET_FRAMES = 0;
/** Y key pressed flag. */
export const Y_PRESSED_RESET_FRAMES = 0;
