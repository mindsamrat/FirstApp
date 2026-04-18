export interface AxisRange {
  min: number;
  max: number;
}

export interface Archetype {
  id: string;
  name: string;
  tagline: string;
  control: AxisRange;
  visibility: AxisRange;
  timeHorizon: AxisRange;
  powerSource: AxisRange;
  rarity: number;
  enemyId: string;
}

export const archetypes: Archetype[] = [
  {
    id: "sovereign",
    name: "The Sovereign",
    tagline: "Commands openly. Builds visible kingdoms.",
    control: { min: 80, max: 100 },
    visibility: { min: 70, max: 100 },
    timeHorizon: { min: 60, max: 90 },
    powerSource: { min: 60, max: 80 },
    rarity: 8,
    enemyId: "shadow",
  },
  {
    id: "shadow",
    name: "The Shadow",
    tagline: "Controls outcomes no one traces back.",
    control: { min: 70, max: 100 },
    visibility: { min: 0, max: 30 },
    timeHorizon: { min: 70, max: 100 },
    powerSource: { min: 70, max: 100 },
    rarity: 6,
    enemyId: "sovereign",
  },
  {
    id: "architect",
    name: "The Architect",
    tagline: "Designs systems that outlive their creator.",
    control: { min: 50, max: 80 },
    visibility: { min: 30, max: 60 },
    timeHorizon: { min: 80, max: 100 },
    powerSource: { min: 40, max: 60 },
    rarity: 14,
    enemyId: "blade",
  },
  {
    id: "oracle",
    name: "The Oracle",
    tagline: "Power through insight others cannot replicate.",
    control: { min: 30, max: 60 },
    visibility: { min: 40, max: 70 },
    timeHorizon: { min: 60, max: 90 },
    powerSource: { min: 0, max: 30 },
    rarity: 9,
    enemyId: "hunter",
  },
  {
    id: "blade",
    name: "The Blade",
    tagline: "Burns the old order. Decisive, kinetic, feared.",
    control: { min: 70, max: 100 },
    visibility: { min: 70, max: 100 },
    timeHorizon: { min: 0, max: 30 },
    powerSource: { min: 70, max: 100 },
    rarity: 12,
    enemyId: "architect",
  },
  {
    id: "diplomat",
    name: "The Diplomat",
    tagline: "Wins without anyone knowing war was fought.",
    control: { min: 30, max: 60 },
    visibility: { min: 50, max: 80 },
    timeHorizon: { min: 60, max: 90 },
    powerSource: { min: 20, max: 40 },
    rarity: 18,
    enemyId: "flame",
  },
  {
    id: "hunter",
    name: "The Hunter",
    tagline: "Opportunist. Moves fast. Extracts value. Exits.",
    control: { min: 40, max: 70 },
    visibility: { min: 20, max: 50 },
    timeHorizon: { min: 0, max: 30 },
    powerSource: { min: 40, max: 70 },
    rarity: 15,
    enemyId: "oracle",
  },
  {
    id: "flame",
    name: "The Flame",
    tagline: "Power through magnetism. Pulls rather than pushes.",
    control: { min: 20, max: 50 },
    visibility: { min: 80, max: 100 },
    timeHorizon: { min: 30, max: 60 },
    powerSource: { min: 0, max: 20 },
    rarity: 18,
    enemyId: "diplomat",
  },
];

export function getCentroid(a: Archetype) {
  return {
    control: (a.control.min + a.control.max) / 2,
    visibility: (a.visibility.min + a.visibility.max) / 2,
    timeHorizon: (a.timeHorizon.min + a.timeHorizon.max) / 2,
    powerSource: (a.powerSource.min + a.powerSource.max) / 2,
  };
}

export function getEnemy(a: Archetype): Archetype {
  return archetypes.find((x) => x.id === a.enemyId)!;
}
