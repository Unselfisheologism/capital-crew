/**
 * Capital Crew — RANDOM EMERGENCY EVENTS
 *
 * Among Us-style reactor/O2 emergencies that fire automatically every
 * 60-120 seconds. A central countdown timer appears and the game world
 * visibly degrades. If the player (or any AI) reaches the affected zone
 * and holds E, they "fix" it; if the timer hits zero, the empire loses
 * 30% of every player's cash as a "system failure" penalty.
 *
 * Types:
 *   - REACTOR MELTDOWN: pulses red on the bank zone
 *   - O2 DEPLETION: blue tint on the residential zones
 *   - POWER GRID FAILURE: yellow flicker on commercial zones
 *   - COMMS BLACKOUT: gray pulse on the plaza
 */
import Phaser from 'phaser';
import { ZONES } from '../data/Properties';

export type EmergencyType =
  | 'reactor'
  | 'o2'
  | 'power'
  | 'comms';

export interface Emergency {
  type: EmergencyType;
  zoneId: string;
  startMs: number;
  durationMs: number;
  resolved: boolean;
  expired: boolean;
  fixedBy: string | null; // player name who resolved it
}

export const EMERGENCY_TEMPLATES: Array<{
  type: EmergencyType;
  zoneIdCandidates: string[];
  durationMs: number;
  color: number;
  label: string;
}> = [
  {
    type: 'reactor',
    zoneIdCandidates: ['bank'],
    durationMs: 35_000,
    color: 0xff2222,
    label: '⚠️ REACTOR MELTDOWN',
  },
  {
    type: 'o2',
    zoneIdCandidates: ['residential_a', 'residential_b'],
    durationMs: 40_000,
    color: 0x4488ff,
    label: '⚠️ O2 DEPLETION',
  },
  {
    type: 'power',
    zoneIdCandidates: ['commercial_a', 'commercial_b'],
    durationMs: 30_000,
    color: 0xffcc00,
    label: '⚠️ POWER GRID FAILURE',
  },
  {
    type: 'comms',
    zoneIdCandidates: ['plaza'],
    durationMs: 25_000,
    color: 0x888888,
    label: '⚠️ COMMS BLACKOUT',
  },
];

export const EMERGENCY_MIN_INTERVAL_MS = 60_000;
export const EMERGENCY_MAX_INTERVAL_MS = 110_000;
export const EMERGENCY_FIX_RANGE = 90; // px — how close to be to fix
export const EMERGENCY_FIX_HOLD_MS = 2500;
export const EMERGENCY_FAIL_PENALTY = 0.30; // 30% cash lost on expiration

/**
 * Roll a random emergency template and pick a zone.
 */
export function rollEmergency(now: number = Date.now()): Emergency {
  const tpl =
    EMERGENCY_TEMPLATES[Math.floor(Math.random() * EMERGENCY_TEMPLATES.length)];
  const zoneId =
    tpl.zoneIdCandidates[
      Math.floor(Math.random() * tpl.zoneIdCandidates.length)
    ];
  return {
    type: tpl.type,
    zoneId,
    startMs: now,
    durationMs: tpl.durationMs,
    resolved: false,
    expired: false,
    fixedBy: null,
  };
}

/** Countdown text colour symbol for UI */
export function emergencyDisplayZoneXy(zoneId: string): { x: number; y: number } | null {
  const z = ZONES.find((zz) => zz.id === zoneId);
  if (!z) return null;
  return { x: z.x + z.w / 2, y: z.y + 14 };
}
