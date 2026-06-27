import {
  PROPERTIES,
  getProperty,
  STARTING_CASH,
  LOAN_AMOUNT,
  MAX_DEBT,
  DEBT_INTEREST_RATE,
  DAY_JOB_WAGE,
  NET_WORTH_TARGET,
  HOMELESS_FEE,
} from '../data/Properties';
import { SKILLS } from '../data/Skills';

export interface TickResult {
  player: number; // index into economy's player array (0 = human)
  messages: string[];
  bankrupt: boolean;
  won: boolean;
}

/**
 * Player financial state — instantiable, so we can have AI states too.
 * The human player is exported as a singleton `humanPlayer`.
 */
export class PlayerState {
  id: string;
  name: string;
  color: number;
  cash: number = STARTING_CASH;
  debt: number = 0;
  ownedPropertyIds: Set<string> = new Set();
  learnedSkills: Set<string> = new Set();
  propertyLevels: Record<string, number> = {};
  tickCount: number = 0;
  streak: number = 0;
  streakType: 'purchase' | 'fix' | null = null;

  constructor(id: string, name: string, color: number) {
    this.id = id;
    this.name = name;
    this.color = color;
  }

  // ── Computed ──

  get propertyValue(): number {
    let total = 0;
    for (const pid of this.ownedPropertyIds) {
      const prop = getProperty(pid);
      if (prop) total += prop.cost;
    }
    return total;
  }

  get netWorth(): number {
    return this.cash + this.propertyValue - this.debt;
  }

  get speedMultiplier(): number {
    let mult = 1.0;
    if (this.learnedSkills.has('hustle')) mult += 0.25;
    return mult;
  }

  get purchaseCostMultiplier(): number {
    let mult = 1.0;
    if (this.learnedSkills.has('negotiation')) mult -= 0.15;
    return mult;
  }

  get incomeMultiplier(): number {
    let mult = 1.0;
    if (this.learnedSkills.has('accounting')) mult += 0.2;
    return mult;
  }

  get rentMultiplier(): number {
    let mult = 1.0;
    if (this.learnedSkills.has('tax_evasion')) mult -= 0.25;
    return mult;
  }

  get propertyCount(): number {
    return this.ownedPropertyIds.size;
  }

  /** Number of properties this player owns in a specific zone. */
  ownedPropertyCountInZone(zoneId: string): number {
    let n = 0;
    for (const pid of this.ownedPropertyIds) {
      const prop = PROPERTIES.find((p) => p.id === pid);
      if (prop && prop.zoneId === zoneId) n++;
    }
    return n;
  }

  // ── Actions ──

  buyProperty(propertyId: string): boolean {
    const prop = getProperty(propertyId);
    if (!prop) return false;
    if (this.ownedPropertyIds.has(propertyId)) return false;
    const cost = Math.round(prop.cost * this.purchaseCostMultiplier);
    if (this.cash < cost) return false;
    this.cash -= cost;
    this.ownedPropertyIds.add(propertyId);
    this.propertyLevels[propertyId] = 1;
    return true;
  }

  /** Forcibly remove ownership of a property (sabotage/eject). */
  removeProperty(propertyId: string): boolean {
    if (!this.ownedPropertyIds.has(propertyId)) return false;
    this.ownedPropertyIds.delete(propertyId);
    delete this.propertyLevels[propertyId];
    return true;
  }

  takeLoan(): boolean {
    if (this.debt >= MAX_DEBT) return false;
    const amount = Math.min(LOAN_AMOUNT, MAX_DEBT - this.debt);
    this.cash += amount;
    this.debt += amount;
    return true;
  }

  payDebt(amount: number): number {
    const paid = Math.min(amount, this.debt, Math.max(0, this.cash));
    this.cash -= paid;
    this.debt -= paid;
    return paid;
  }

  workDayJob(): number {
    const bonusSkills = this.learnedSkills.has('hustle') ? 1.1 : 1.0;
    const earned = Math.round(DAY_JOB_WAGE * bonusSkills);
    this.cash += earned;
    return earned;
  }

  hasSkill(skillId: string): boolean {
    return this.learnedSkills.has(skillId);
  }

  learnSkill(skillId: string): boolean {
    const skill = SKILLS.find((s) => s.id === skillId);
    if (!skill) return false;
    if (this.learnedSkills.has(skillId)) return false;
    if (this.cash < skill.cost) return false;
    this.cash -= skill.cost;
    this.learnedSkills.add(skillId);
    return true;
  }

  getPropertyLevel(propertyId: string): number {
    return this.propertyLevels[propertyId] || 1;
  }

  upgradeProperty(propertyId: string): { success: boolean; cost?: number; newLevel?: number } {
    if (!this.ownedPropertyIds.has(propertyId)) return { success: false };
    const level = this.getPropertyLevel(propertyId);
    if (level >= 5) return { success: false };
    const prop = getProperty(propertyId);
    if (!prop) return { success: false };
    const cost = Math.round(prop.cost * 0.3 * level);
    if (this.cash < cost) return { success: false };
    this.cash -= cost;
    this.propertyLevels[propertyId] = level + 1;
    return { success: true, cost, newLevel: level + 1 };
  }

  getPropertyIncome(propertyId: string): number {
    const prop = getProperty(propertyId);
    if (!prop) return 0;
    const level = this.getPropertyLevel(propertyId);
    const upgradeMul = 1 + (level - 1) * 0.5;
    return Math.round(prop.incomePerTick * upgradeMul * this.incomeMultiplier);
  }

  getPropertyCost(propertyId: string): number {
    const prop = getProperty(propertyId);
    if (!prop) return Infinity;
    return Math.round(prop.cost * this.purchaseCostMultiplier);
  }

  getUpgradeCost(propertyId: string): number {
    if (!this.ownedPropertyIds.has(propertyId)) return Infinity;
    const level = this.getPropertyLevel(propertyId);
    if (level >= 5) return Infinity;
    const prop = getProperty(propertyId);
    if (!prop) return Infinity;
    return Math.round(prop.cost * 0.3 * level);
  }

  // ── Tick ──

  processTick(): TickResult {
    this.tickCount++;
    const messages: string[] = [];

    let income = 0;
    for (const pid of this.ownedPropertyIds) {
      const inc = this.getPropertyIncome(pid);
      income += inc;
    }
    if (income > 0) {
      this.cash += income;
      messages.push(`💰 Passive income: +$${income.toLocaleString()}`);
    }

    if (this.debt > 0) {
      const interest = Math.ceil(this.debt * 0.05);
      this.cash -= interest;
      this.debt += interest;
      messages.push(`🏦 Debt interest: -$${interest.toLocaleString()}`);
    }

    if (this.learnedSkills.has('investing') && this.cash > 0) {
      const bonus = Math.floor(this.cash * 0.01);
      if (bonus > 0) {
        this.cash += bonus;
        messages.push(`📈 Investment interest: +$${bonus.toLocaleString()}`);
      }
    }

    if (this.propertyCount === 0) {
      this.cash -= HOMELESS_FEE;
      messages.push(`🏕️ Homeless fee: -$${HOMELESS_FEE.toLocaleString()}`);
    }

    let bankrupt = false;
    if (this.cash < -1000 && this.propertyCount === 0) {
      bankrupt = true;
      messages.push('💀 BANKRUPT! You have been eliminated.');
    }

    let won = false;
    if (this.netWorth >= NET_WORTH_TARGET && !bankrupt) {
      won = true;
      messages.push(`🏆 Net worth target reached! $${this.netWorth.toLocaleString()}`);
    }

    return { player: 0, messages, bankrupt, won };
  }

  /** Get a formatted HUD summary */
  getHUDSummary(): Record<string, string> {
    const skillNames = Array.from(this.learnedSkills).map((id) => {
      const s = SKILLS.find((sk) => sk.id === id);
      return s ? s.name : id;
    });
    return {
      Cash: `$${this.cash.toLocaleString()}`,
      Debt: this.debt > 0 ? `$${this.debt.toLocaleString()}` : 'None',
      'Net Worth': `$${this.netWorth.toLocaleString()}`,
      Properties: this.propertyCount > 0 ? `${this.propertyCount} owned` : 'None',
      Skills: skillNames.length > 0 ? skillNames.join(', ') : 'None',
      Tick: `#${this.tickCount}`,
    };
  }
  /** Reset to starting state for new game */
  reset(): void {
    this.cash = STARTING_CASH;
    this.debt = 0;
    this.ownedPropertyIds.clear();
    this.learnedSkills.clear();
    this.propertyLevels = {};
    this.tickCount = 0;
  }
}

/** Human player singleton */
export const humanPlayer = new PlayerState('human', 'You', 0x00ffff);
