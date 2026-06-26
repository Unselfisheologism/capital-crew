/** Map layout constants */
export const MAP_W = 2000;
export const MAP_H = 2000;
export const TILE = 80;

/** Economy constants */
export const STARTING_CASH = 5_000;
export const LOAN_AMOUNT = 2_000;
export const MAX_DEBT = 20_000;
export const DEBT_INTEREST_RATE = 0.05; // 5% per tick
export const DAY_JOB_WAGE = 200;
export const TICK_INTERVAL_MS = 30_000; // 30 seconds
export const NET_WORTH_TARGET = 80_000;
export const HOMELESS_FEE = 200;

// ──────────────────────────────────────────────────────────────
// MAP ZONES
// ──────────────────────────────────────────────────────────────

export interface ZoneDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  label: string;
  icon?: string;
}

export const ZONES: ZoneDef[] = [
  // Top row: services
  { id: 'bank', x: 100, y: 100, w: 360, h: 320, color: 0x2a6f97, label: 'Bank', icon: '🏦' },
  { id: 'university', x: 620, y: 100, w: 440, h: 320, color: 0x6d597a, label: 'University', icon: '🎓' },
  { id: 'day_job', x: 1220, y: 100, w: 360, h: 320, color: 0x4a7c59, label: 'Day Job Center', icon: '💼' },
  { id: 'real_estate', x: 1740, y: 100, w: 200, h: 320, color: 0xb5651d, label: 'Real Estate', icon: '🏠' },

  // Middle: walkable corridor
  { id: 'plaza', x: 100, y: 520, w: 1840, h: 120, color: 0x2a2a3e, label: 'Central Plaza' },

  // Bottom: property zones
  { id: 'residential_a', x: 100, y: 740, w: 420, h: 320, color: 0x3a6ea5, label: 'Residential A', icon: '🏘️' },
  { id: 'commercial_a', x: 620, y: 740, w: 420, h: 320, color: 0x8b5e3c, label: 'Commercial A', icon: '🏪' },
  { id: 'residential_b', x: 1140, y: 740, w: 420, h: 320, color: 0x3a6ea5, label: 'Residential B', icon: '🏘️' },
  { id: 'commercial_b', x: 1660, y: 740, w: 280, h: 320, color: 0x8b5e3c, label: 'Commercial B', icon: '🏪' },
];

// ──────────────────────────────────────────────────────────────
// PURCHASABLE PROPERTIES
// ──────────────────────────────────────────────────────────────

export interface PropertyDef {
  id: string;
  name: string;
  cost: number;
  incomePerTick: number;
  zoneId: string;
  description: string;
}

export const PROPERTIES: PropertyDef[] = [
  // Residential A
  { id: 'prop_green_villa', name: 'Green Villa', cost: 8_000, incomePerTick: 120, zoneId: 'residential_a', description: 'A cozy home with a garden.' },
  { id: 'prop_blue_cottage', name: 'Blue Cottage', cost: 6_000, incomePerTick: 90, zoneId: 'residential_a', description: 'Compact and affordable starter home.' },
  { id: 'prop_red_townhouse', name: 'Red Townhouse', cost: 10_000, incomePerTick: 160, zoneId: 'residential_a', description: 'Spacious family home in a quiet row.' },

  // Residential B
  { id: 'prop_lake_house', name: 'Lake House', cost: 12_000, incomePerTick: 180, zoneId: 'residential_b', description: 'Premium lakeside retreat.' },
  { id: 'prop_hilltop_bungalow', name: 'Hilltop Bungalow', cost: 9_000, incomePerTick: 140, zoneId: 'residential_b', description: 'Scenic views and fresh air.' },

  // Commercial A
  { id: 'prop_corner_store', name: 'Corner Store', cost: 14_000, incomePerTick: 250, zoneId: 'commercial_a', description: 'Busy neighborhood convenience store.' },
  { id: 'prop_office_suite', name: 'Office Suite', cost: 18_000, incomePerTick: 320, zoneId: 'commercial_a', description: 'Prime downtown office space.' },

  // Commercial B
  { id: 'prop_warehouse', name: 'Warehouse', cost: 20_000, incomePerTick: 380, zoneId: 'commercial_b', description: 'Large industrial storage unit.' },
  { id: 'prop_retail_space', name: 'Retail Space', cost: 15_000, incomePerTick: 280, zoneId: 'commercial_b', description: 'High-traffic retail storefront.' },
];

/** Get properties in a given zone */
export function getPropertiesInZone(zoneId: string): PropertyDef[] {
  return PROPERTIES.filter((p) => p.zoneId === zoneId);
}

/** Lookup a property by id */
export function getProperty(id: string): PropertyDef | undefined {
  return PROPERTIES.find((p) => p.id === id);
}
