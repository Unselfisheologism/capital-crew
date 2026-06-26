export interface SkillDef {
  id: string;
  name: string;
  cost: number;
  description: string;
  /** Time to learn in milliseconds */
  trainTimeMs: number;
}

/**
 * Skills players can learn at the University.
 * Each costs cash and takes time to train.
 */
export const SKILLS: SkillDef[] = [
  {
    id: 'negotiation',
    name: 'Negotiation',
    cost: 1_000,
    description: 'Reduces property purchase costs by 15%.',
    trainTimeMs: 8_000,
  },
  {
    id: 'accounting',
    name: 'Accounting',
    cost: 1_500,
    description: 'Increases passive income from owned assets by 20%.',
    trainTimeMs: 10_000,
  },
  {
    id: 'hustle',
    name: 'Hustle',
    cost: 800,
    description: 'Increases movement speed by 25%.',
    trainTimeMs: 6_000,
  },
  {
    id: 'tax_evasion',
    name: 'Tax Evasion',
    cost: 1_200,
    description: 'Reduces rent paid to other players by 25%.',
    trainTimeMs: 9_000,
  },
  {
    id: 'investing',
    name: 'Investing',
    cost: 2_000,
    description: 'Earn bonus interest on cash savings (1% per tick).',
    trainTimeMs: 12_000,
  },
];

/** Lookup a skill by id */
export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find((s) => s.id === id);
}
