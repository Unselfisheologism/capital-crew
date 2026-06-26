/**
 * Capital Crew — SABOTAGE SYSTEM
 *
 * Async emergency actions the player can deploy from anywhere on the map by
 * pressing the SAB key (T). Inspired by Among Us sabotage classes.
 *
 * Tier 1 — DISRUPTIONS (cheap, short cooldown)
 *   - Lights Out:  blinds the screen for 8s with low-pass darkness overlay
 *   - Comms Jam:  hide HUD/economic tick counter for 12s
 *   - Bank Audit:  forces all AIs to pay +10% interest next tick
 *
 * Tier 2 — LOCKDOWNS (mid cost, medium cooldown)
 *   - Zone Quarantine: locks ONE zone by ID for 15s — nobody can enter it
 *   - Rent Strike: stops all passive property income for 12s
 *   - Debt Freeze: AI debt can't grow interest for 12s
 *
 * Tier 3 — CRITICAL (expensive, long cooldown, single use per game)
 *   - Market Crash: removes 25% of every player's cash (incl. self)
 *   - Bankrupt Tycoon: all AIs with debt > 0 instantly lose 1 random property
 *
 * Each sabotage has a zone id (optional), a duration, and a cooldown.
 */
import Phaser from 'phaser';

export type SabotageId =
  | 'lights_out'
  | 'comms_jam'
  | 'bank_audit'
  | 'zone_quarantine'
  | 'rent_strike'
  | 'debt_freeze'
  | 'market_crash'
  | 'bankrupt_tycoon';

export interface SabotageDef {
  id: SabotageId;
  name: string;
  icon: string;
  tier: 1 | 2 | 3;
  cost: number;
  durationMs: number;
  cooldownMs: number;
  desc: string;
  /** Optional zone selector */
  requiresZone?: boolean;
}

export const SABOTAGES: SabotageDef[] = [
  {
    id: 'lights_out',
    name: 'Lights Out',
    icon: '💡',
    tier: 1,
    cost: 300,
    durationMs: 8000,
    cooldownMs: 45_000,
    desc: 'Blur the screen — your assassin can hide easier.',
  },
  {
    id: 'comms_jam',
    name: 'Comms Jam',
    icon: '📡',
    tier: 1,
    cost: 200,
    durationMs: 12_000,
    cooldownMs: 35_000,
    desc: 'Hide tick timer + AI leaderboard for 12s.',
  },
  {
    id: 'bank_audit',
    name: 'Bank Audit',
    icon: '🏦',
    tier: 1,
    cost: 400,
    durationMs: 30_000,
    cooldownMs: 60_000,
    desc: 'All AIs pay +10% interest next tick.',
  },
  {
    id: 'zone_quarantine',
    name: 'Zone Quarantine',
    icon: '🔒',
    tier: 2,
    cost: 700,
    durationMs: 15_000,
    cooldownMs: 90_000,
    desc: 'Lock a zone — nobody can enter for 15s.',
    requiresZone: true,
  },
  {
    id: 'rent_strike',
    name: 'Rent Strike',
    icon: '🪧',
    tier: 2,
    cost: 600,
    durationMs: 12_000,
    cooldownMs: 75_000,
    desc: 'All passive property income halted for 12s.',
  },
  {
    id: 'debt_freeze',
    name: 'Debt Freeze',
    icon: '❄️',
    tier: 2,
    cost: 500,
    durationMs: 12_000,
    cooldownMs: 60_000,
    desc: 'AI debt interest on hold for 12s.',
  },
  {
    id: 'market_crash',
    name: 'Market Crash',
    icon: '📉',
    tier: 3,
    cost: 1_500,
    durationMs: 0,
    cooldownMs: 180_000,
    desc: 'Remove 25% of every player cash (incl. you). Single use.',
  },
  {
    id: 'bankrupt_tycoon',
    name: 'Bankrupt Tycoon',
    icon: '🏚️',
    tier: 3,
    cost: 1_800,
    durationMs: 0,
    cooldownMs: 240_000,
    desc: 'Forfeit a random property from each indebted AI. Single use.',
  },
];

export interface ActiveSabotage {
  id: SabotageId;
  /** Timestamp when it ends. */
  endsAt: number;
  /** Quarantined zone id (zone_quarantine only). */
  zoneId?: string;
  /** Single-shot (tier 3) so we don't double-apply. */
  consumed?: boolean;
}

/**
 * Toggles a sabotage. Returns null if there's nothing to show (already happened).
 * Returns { activated, endsAt, zoneId, id } on success.
 */
export function buildSabotage(
  scene: Phaser.Scene,
  id: SabotageId,
  zoneId?: string,
  now: number = Date.now(),
): ActiveSabotage | null {
  const def = SABOTAGES.find((s) => s.id === id);
  if (!def) return null;
  if (def.requiresZone && !zoneId) return null;
  return {
    id,
    endsAt: now + def.durationMs,
    zoneId,
    consumed: false,
  };
}
