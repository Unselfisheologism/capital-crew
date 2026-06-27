import Phaser from 'phaser';
import { PROPERTIES, type PropertyDef } from '../data/Properties';
import { randomFloat } from '../utils/math';
import { PlayerState } from '../state/PlayerState';

export interface PlayerMomentSnapshot {
  cash: number;
  debt: number;
  netWorth: number;
  ownedPropertyIds: string[];
  tickCount: number;
  learnedSkills: string[];
  propertyLevels: Record<string, number>;
}

export type CompetitionId =
  | 'bank_liquidity'
  | 'research_grant'
  | 'speed_contract'
  | 'lease_bid'
  | 'district_vision'
  | 'priority_permit'
  | 'market_micro';

export interface CompetitionDef {
  id: CompetitionId;
  emoji: string;
  name: string;
  shortDesc: string;
  description: string;
  category: 'liquidity' | 'research' | 'speed' | 'bid' | 'strategy';
  visibility: 'all' | 'human-only';
  eligibility: (snap: PlayerMomentSnapshot) => boolean;
  value: (snap: PlayerMomentSnapshot) => number;
  formatValue: (v: number) => string;
  durationMs: number;
  reward: number;
  cooldownMs: number;
  bonusMultiplier: number;
  offerSlot: boolean;
}

export interface ActiveCompetition {
  id: CompetitionId;
  instanceId: string;
  expiresAt: number;
  entries: Map<string, PlayerMomentSnapshot>;
  status: 'open' | 'closed';
  winnerUserId?: string | null;
}

export const COMPETITION_DEFS: CompetitionDef[] = [
  {
    id: 'bank_liquidity',
    emoji: '💸',
    name: 'Cash Liquidity Sprint',
    shortDesc: 'Whoever has the most cash when this closes wins.',
    description: 'Pure spendable cash, not property. Viel Glück.',
    category: 'liquidity',
    visibility: 'all',
    eligibility: () => true,
    value: (snap) => snap.cash,
    formatValue: (v) => `$${Math.round(v).toLocaleString()}`,
    durationMs: 180_000,
    reward: 2500,
    cooldownMs: 240_000,
    bonusMultiplier: 1.15,
    offerSlot: true,
  },
  {
    id: 'research_grant',
    emoji: '🎓',
    name: 'Research Grant',
    shortDesc: 'Largest property empire in a knowledge zone.',
    description:
      'This grant measures your footprint in the research zone: property cost + level.',
    category: 'research',
    visibility: 'all',
    eligibility: () => true,
    value: (snap) =>
      snap.ownedPropertyIds.reduce((sum, pid) => {
        const prop = propertyDefMap[pid];
        if (!prop || prop.zoneId !== 'university') return sum;
        return sum + prop.cost * (snap.propertyLevels[pid] ?? 1);
      }, 0),
    formatValue: (v) => `$${Math.round(v).toLocaleString()}`,
    durationMs: 240_000,
    reward: 3500,
    cooldownMs: 300_000,
    bonusMultiplier: 1.25,
    offerSlot: true,
  },
  {
    id: 'speed_contract',
    emoji: '⚡',
    name: 'Speed Contract',
    shortDesc: 'First to move grabs the prize.',
    description:
      'First is best: the fastest response decides who claims the reward.',
    category: 'speed',
    visibility: 'all',
    eligibility: () => true,
    value: (_snap) => -Infinity,
    formatValue: () => '--',
    durationMs: 120_000,
    reward: 1500,
    cooldownMs: 200_000,
    bonusMultiplier: 1.10,
    offerSlot: true,
  },
  {
    id: 'lease_bid',
    emoji: '🏷️',
    name: 'Lease Bid',
    shortDesc: 'Pick your price. The highest bid wins.',
    description: 'Call your price. Highest sealed bid wins the pool.',
    category: 'bid',
    visibility: 'all',
    eligibility: (snap) => snap.cash >= 800,
    value: (snap) => snap.cash,
    formatValue: (v) => `$${Math.round(v).toLocaleString()}`,
    durationMs: 180_000,
    reward: 2500,
    cooldownMs: 240_000,
    bonusMultiplier: 1.15,
    offerSlot: true,
  },
  {
    id: 'district_vision',
    emoji: '🏙️',
    name: 'District Value',
    shortDesc: 'Highest portfolio value across a targeted district.',
    description:
      'Focus on a district portfolio. Ownership spread matters.',
    category: 'strategy',
    visibility: 'all',
    eligibility: () => true,
    value: (snap) =>
      snap.ownedPropertyIds.reduce((sum, pid) => {
        const prop = propertyDefMap[pid];
        if (!prop) return sum;
        return sum + prop.cost * (snap.propertyLevels[pid] ?? 1);
      }, 0),
    formatValue: (v) => `$${Math.round(v).toLocaleString()}`,
    durationMs: 240_000,
    reward: 3500,
    cooldownMs: 300_000,
    bonusMultiplier: 1.25,
    offerSlot: true,
  },
  {
    id: 'priority_permit',
    emoji: '🛂',
    name: 'Priority Permit',
    shortDesc: 'Navigate zones efficiently. Fewer missed zones win.',
    description:
      'Pattern is rewarded: visit as many zones as possible.',
    category: 'speed',
    visibility: 'all',
    eligibility: () => true,
    value: (snap) => snap.ownedPropertyIds.length,
    formatValue: (v) => `${Math.round(v)} properties`,
    durationMs: 180_000,
    reward: 2000,
    cooldownMs: 240_000,
    bonusMultiplier: 1.20,
    offerSlot: true,
  },
  {
    id: 'market_micro',
    emoji: '📈',
    name: 'Micro Market',
    shortDesc: 'Highest worth wins hidden market.',
    description:
      'This auction is only available if you can prove profit. Highest legal bid takes all.',
    category: 'liquidity',
    visibility: 'human-only',
    eligibility: (snap) => snap.netWorth > 0 && snap.cash > 0,
    value: (snap) => snap.cash,
    formatValue: (v) => `$${Math.round(v).toLocaleString()}`,
    durationMs: 150_000,
    reward: 1600,
    cooldownMs: 200_000,
    bonusMultiplier: 1.10,
    offerSlot: false,
  },
];

export const COMPETITION_EMIT_INTERVAL_MS = 60_000;
export const COMPETITION_SLOTS_VISIBLE = 3;

/* Property -> zone lookup (stable cache). */
const propertyZoneCache: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const p of PROPERTIES) out[p.id] = p.zoneId;
  return out;
})();

export function getPropertyZoneSafe(propertyId: string): string {
  return propertyZoneCache[propertyId] ?? '';
}

/* Property -> def stable lookup. */
const propertyDefMap: Record<string, PropertyDef> = Object.create(null) as Record<
  string,
  PropertyDef
>;
for (const p of PROPERTIES) propertyDefMap[p.id] = p;

export function getPropertyDefSafe(propertyId: string): PropertyDef | undefined {
  return propertyDefMap[propertyId];
}

export function canRevealCompetition(def: CompetitionDef): boolean {
  return def.visibility === 'all';
}

export interface CompetitionSlotBrief {
  id: CompetitionId;
  emoji: string;
  name: string;
  shortDesc: string;
  endsInMs: number;
  reward: number;
}

export function summarizeBrief(active: ActiveCompetition | null): CompetitionSlotBrief | null {
  if (!active || active.status !== 'open') return null;
  const def = COMPETITION_DEFS.find((d) => d.id === active.id);
  if (!def || !def.offerSlot) return null;
  return {
    id: def.id,
    emoji: def.emoji,
    name: def.name,
    shortDesc: def.shortDesc,
    endsInMs: Math.max(0, active.expiresAt - Date.now()),
    reward: def.reward,
  };
}

export function buildCompetitionSnapshot(state: PlayerState): PlayerMomentSnapshot {
  return {
    cash: state.cash,
    debt: state.debt,
    netWorth: state.netWorth,
    ownedPropertyIds: Array.from(state.ownedPropertyIds),
    tickCount: state.tickCount,
    learnedSkills: Array.from(state.learnedSkills),
    propertyLevels: { ...state.propertyLevels },
  };
}

export function pickRandomCompetition(
  now: number,
  cooldowns: Map<CompetitionId, number>,
): { def: CompetitionDef; cooldownUntil: number } | null {
  let eligible: Array<{ def: CompetitionDef; cooldownUntil: number }> = [];
  for (const def of COMPETITION_DEFS) {
    const until = cooldowns.get(def.id) ?? 0;
    if (until > now) continue;
    eligible.push({ def, cooldownUntil: now });
  }
  if (!eligible.length) return null;
  const pick = eligible[Math.floor(randomFloat(0, eligible.length))];
  return { def: pick.def, cooldownUntil: now + pick.def.cooldownMs };
}
