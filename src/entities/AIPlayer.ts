import Phaser from 'phaser';
import { PlayerState } from '../state/PlayerState';
import { ZONES, PROPERTIES, LOAN_AMOUNT } from '../data/Properties';
import { SKILLS } from '../data/Skills';
import { generateCapsuleTexture } from './Player';

// ── AI Personality Definitions ──
export interface Personality {
  id: string;
  name: string;
  color: number;
  loanWeight: number;
  workWeight: number;
  propertyWeight: number;
  skillPriority: string[];
  riskTolerance: number;
  speed: number;
  interactDelay: number;
}

export const AI_PERSONALITIES: Personality[] = [
  {
    id: 'tycoon',
    name: 'Tycoon',
    color: 0xff4444,
    loanWeight: 0.7,
    workWeight: 0.2,
    propertyWeight: 0.8,
    skillPriority: ['negotiation', 'accounting'],
    riskTolerance: 0.6,
    speed: 90,
    interactDelay: 2000,
  },
  {
    id: 'hustler',
    name: 'Hustler',
    color: 0xff8800,
    loanWeight: 0.3,
    workWeight: 0.7,
    propertyWeight: 0.4,
    skillPriority: ['hustle', 'tax_evasion'],
    riskTolerance: 0.3,
    speed: 110,
    interactDelay: 1500,
  },
  {
    id: 'scholar',
    name: 'Scholar',
    color: 0xaa44ff,
    loanWeight: 0.1,
    workWeight: 0.4,
    propertyWeight: 0.5,
    skillPriority: ['investing', 'accounting', 'negotiation', 'hustle'],
    riskTolerance: 0.1,
    speed: 80,
    interactDelay: 3000,
  },
];

type AIState = 'idle' | 'moving' | 'interacting' | 'cooldown';

const HOME_ZONES: Record<string, string> = {
  tycoon: 'commercial_a',
  hustler: 'day_job',
  scholar: 'university',
};

/** Zone cycle for AI behaviour */
const ACTION_ZONES = [
  'bank', 'day_job', 'university', 'real_estate',
  'residential_a', 'commercial_a', 'residential_b', 'commercial_b',
];

function getZoneCenter(zoneId: string): { x: number; y: number } | null {
  const z = ZONES.find((z) => z.id === zoneId);
  if (!z) return null;
  return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
}

// ── AI Player Entity ──
export class AIPlayer {
  public sprite: Phaser.Physics.Arcade.Sprite;
  public body: Phaser.Physics.Arcade.Body;
  public label: Phaser.GameObjects.Text;
  public state: PlayerState;
  public personality: Personality;

  private scene: Phaser.Scene;
  private aiState: AIState = 'idle';
  private targetX = 0;
  private targetY = 0;
  private stateTimer = 0;
  private decisionTimer = 3000;
  private actionIndex = 0;
  private currentTargetZone: string | null = null;
  private onEnterZone: (zoneId: string) => void;

  constructor(
    scene: Phaser.Scene,
    personality: Personality,
    state: PlayerState,
    /** Public read-only accessor; sabotage / eject logic uses this. */
    onEnterZone: (zoneId: string) => void,
  ) {
    this.scene = scene;
    this.personality = personality;
    this.state = state;
    this.onEnterZone = onEnterZone;

    // Spawn at home zone centre
    const homeZone = HOME_ZONES[personality.id] ?? 'plaza';
    const spawn = getZoneCenter(homeZone) ?? { x: 400, y: 400 };

    const texKey = generateCapsuleTexture(scene, personality.color, personality.name);
    this.sprite = scene.physics.add.sprite(spawn.x, spawn.y, texKey);
    this.sprite.setDepth(10);
    this.sprite.setOrigin(0.5, 0.55);

    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(11, 3, 6);
    this.body.setCollideWorldBounds(true);
    this.body.setBounce(0, 0);

    this.label = scene.add
      .text(spawn.x, spawn.y - 24, personality.name, {
        fontSize: '10px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(11);

    // Head toward first target after a short delay
    this.stateTimer = 1000 + Math.random() * 2000;
  }

  /** Read-only accessor for sabotage / eject logic. */
  get currentZoneId(): string | null {
    return this.currentTargetZone;
  }

  /** Eject this AI from `zoneId` — pick a different target next decision. */
  forceExpelFromZone(zoneId: string): void {
    if (this.currentTargetZone !== zoneId) return;
    // Force a new decision by re-running the public pickTarget logic
    const otherZones = ['bank', 'university', 'day_job', 'plaza', 'residential_a', 'commercial_a', 'residential_b', 'commercial_b']
      .filter((z) => z !== zoneId);
    this.currentTargetZone = otherZones[Math.floor(Math.random() * otherZones.length)];
    const center = getZoneCenter(this.currentTargetZone);
    if (center) {
      this.targetX = center.x;
      this.targetY = center.y;
      this.aiState = 'moving';
      this.stateTimer = 5000;
    }
  }

  update(dt: number): void {
    this.decisionTimer -= dt;
    this.stateTimer -= dt;

    switch (this.aiState) {
      case 'idle':
        if (this.decisionTimer <= 0 || this.stateTimer <= 0) {
          this.pickNextTarget();
        }
        break;

      case 'moving':
        this.moveTowardTarget(dt);
        break;

      case 'interacting':
        if (this.stateTimer <= 0) {
          this.executeInteraction();
          this.aiState = 'cooldown';
          this.stateTimer = 2000 + Math.random() * 2000;
        }
        break;

      case 'cooldown':
        if (this.stateTimer <= 0) {
          this.actionIndex = (this.actionIndex + 1) % ACTION_ZONES.length;
          this.decisionTimer = 0;
          this.pickNextTarget();
        }
        break;
    }

    this.label.setPosition(this.sprite.x, this.sprite.y - 24);
  }

  private moveTowardTarget(_dt: number): void {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 25) {
      this.body.setVelocity(0, 0);
      if (this.currentTargetZone && this.onEnterZone) {
        this.onEnterZone(this.currentTargetZone);
      }
      this.aiState = 'interacting';
      this.stateTimer = this.personality.interactDelay;
      return;
    }
    const speed = this.personality.speed;
    this.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  private pickNextTarget(): void {
    let zoneId: string | null = null;
    for (let attempt = 0; attempt < ACTION_ZONES.length * 2; attempt++) {
      const candidate = ACTION_ZONES[this.actionIndex % ACTION_ZONES.length];
      if (this.isZoneRelevant(candidate)) {
        zoneId = candidate;
        this.actionIndex = (this.actionIndex + 1) % ACTION_ZONES.length;
        break;
      }
      this.actionIndex = (this.actionIndex + 1) % ACTION_ZONES.length;
    }

    if (!zoneId) zoneId = 'plaza';

    const center = getZoneCenter(zoneId);
    if (!center) {
      this.aiState = 'idle';
      this.decisionTimer = 3000;
      return;
    }

    this.currentTargetZone = zoneId;
    this.targetX = center.x;
    this.targetY = center.y;
    this.aiState = 'moving';
  }

  private isZoneRelevant(zoneId: string): boolean {
    const s = this.state;
    const r = Math.random();
    switch (zoneId) {
      case 'bank':
        return (s.debt < 4000 && this.personality.loanWeight > r * 0.5) || s.debt > 0;
      case 'day_job':
        return s.cash < 2000 || this.personality.workWeight > r * 0.5;
      case 'university': {
        const remaining = this.personality.skillPriority.filter((id) => !s.hasSkill(id));
        return remaining.length > 0;
      }
      case 'real_estate': {
        const affordable = PROPERTIES.some((p) => s.cash >= s.getPropertyCost(p.id) && !s.ownedPropertyIds.has(p.id));
        return affordable && (s.propertyCount < 3 || this.personality.propertyWeight > r * 0.3);
      }
      case 'residential_a':
      case 'residential_b':
      case 'commercial_a':
      case 'commercial_b': {
        const inZone = PROPERTIES.filter((p) => p.zoneId === zoneId);
        const affordable = inZone.some((p) => s.cash >= s.getPropertyCost(p.id) && !s.ownedPropertyIds.has(p.id));
        return affordable;
      }
      default:
        return true;
    }
  }

  private executeInteraction(): void {
    const zoneId = this.currentTargetZone;
    const s = this.state;
    if (!zoneId) return;

    switch (zoneId) {
      case 'bank':
        if (s.debt < 4000 && s.cash < 3000 && Math.random() < this.personality.loanWeight) {
          s.takeLoan();
        } else if (s.debt > 0 && s.cash > s.debt * 0.3 && Math.random() < 0.4) {
          s.payDebt(Math.min(s.cash, s.debt));
        }
        break;

      case 'day_job':
        s.workDayJob();
        break;

      case 'university': {
        const next = this.personality.skillPriority.find((id) => {
          const skill = SKILLS.find((sk) => sk.id === id);
          return !s.hasSkill(id) && skill && s.cash >= skill.cost;
        });
        if (next) s.learnSkill(next);
        break;
      }

      case 'real_estate': {
        const toBuy = PROPERTIES.filter(
          (p) => !s.ownedPropertyIds.has(p.id) && s.cash >= s.getPropertyCost(p.id),
        ).sort((a, b) => s.getPropertyCost(a.id) - s.getPropertyCost(b.id))[0];
        if (toBuy) s.buyProperty(toBuy.id);
        break;
      }

      case 'residential_a':
      case 'residential_b':
      case 'commercial_a':
      case 'commercial_b': {
        const candidates = PROPERTIES.filter(
          (p) => p.zoneId === zoneId && !s.ownedPropertyIds.has(p.id) && s.cash >= s.getPropertyCost(p.id),
        ).sort((a, b) => s.getPropertyCost(a.id) - s.getPropertyCost(b.id));
        if (candidates.length > 0) s.buyProperty(candidates[0].id);
        break;
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.state.reset();
  }
}
