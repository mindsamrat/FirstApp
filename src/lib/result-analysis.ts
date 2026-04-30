import { archetypes, getCentroid, type Archetype, type AxisId } from "@/data/archetypes";
import { questions } from "@/data/questions";
import type { AxisScores, MatchResult } from "@/lib/scoring";
import type { StoredAnswer } from "@/lib/signature-answers";

// ---------- Archetype blend ----------
//
// Convert 4D distances into a softmax-ish percentage so users see they aren't
// a "pure" type — the typical pattern is 60/25/10/5 across the top archetypes.

const BLEND_TEMP = 18; // lower = more concentrated on top archetype

export interface BlendEntry {
  id: string;
  name: string;
  percent: number;
}

export function archetypeBlend(scores: AxisScores): BlendEntry[] {
  const distances = archetypes.map((a) => {
    const c = getCentroid(a);
    const d = Math.hypot(
      scores.control - c.control,
      scores.visibility - c.visibility,
      scores.timeHorizon - c.timeHorizon,
      scores.powerSource - c.powerSource
    );
    return { archetype: a, distance: d };
  });

  const expWeights = distances.map((x) => Math.exp(-x.distance / BLEND_TEMP));
  const total = expWeights.reduce((s, x) => s + x, 0) || 1;

  const blend = distances
    .map((x, i) => ({
      id: x.archetype.id,
      name: x.archetype.name,
      raw: (expWeights[i] / total) * 100,
    }))
    .sort((a, b) => b.raw - a.raw);

  // Round but ensure top entry stays leading after rounding.
  return blend.map((x) => ({ id: x.id, name: x.name, percent: Math.round(x.raw) }));
}

// ---------- Match confidence ----------

export type ConfidenceLevel = "high" | "moderate" | "borderline";

export interface ConfidenceReading {
  level: ConfidenceLevel;
  label: string;
  description: string;
  /** Distance gap to the runner-up. Larger = more confident. */
  gap: number;
}

export function readConfidence(match: MatchResult): ConfidenceReading {
  const gap = match.runnerUpDistance - match.distance;
  if (gap >= 18) {
    return {
      level: "high",
      label: "Strong match",
      description: `Your signature reads as ${match.archetype.name} clearly. The next-closest archetype isn't close.`,
      gap,
    };
  }
  if (gap >= 9) {
    return {
      level: "moderate",
      label: "Clear match",
      description: `${match.archetype.name} is your dominant pattern, with a secondary lean toward ${match.runnerUp.name}.`,
      gap,
    };
  }
  return {
    level: "borderline",
    label: "Borderline",
    description: `You sit between ${match.archetype.name} and ${match.runnerUp.name}. Re-take in 3 months — most people drift toward one.`,
    gap,
  };
}

// ---------- Per-axis attribution ----------
//
// For each axis, surface the two answers whose deltas pushed the user's
// score on that axis the most (in absolute value). Lets the results page
// say: "Your Time-Horizon score is 75 mostly because of your answer to Q9
// and Q14."

export interface AxisAttributionEntry {
  questionId: string;
  prompt: string;
  optionText: string;
  delta: number;
  framework?: { name: string; citation: string; probes: string };
}

export type AxisAttribution = Record<AxisId, AxisAttributionEntry[]>;

export function perAxisAttribution(answers: StoredAnswer[]): AxisAttribution {
  const axes: AxisId[] = ["control", "visibility", "timeHorizon", "powerSource"];
  const result = {} as AxisAttribution;

  for (const axis of axes) {
    const enriched = answers
      .map((a) => {
        const q = questions.find((qq) => qq.id === a.q);
        if (!q || q.kind === "free-text" || q.kind === "email") return null;
        const option = q.options.find((o) => o.id === a.o);
        if (!option) return null;
        const delta = a.d[axis] ?? 0;
        if (Math.abs(delta) < 5) return null;
        return {
          questionId: a.q,
          prompt: q.prompt,
          optionText: option.text,
          delta,
          framework: q.framework,
          magnitude: Math.abs(delta),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    enriched.sort((a, b) => b.magnitude - a.magnitude);
    result[axis] = enriched.slice(0, 2).map(({ magnitude: _, ...rest }) => {
      void _;
      return rest;
    });
  }

  return result;
}

// ---------- Score-band-derived strengths/weaknesses ----------
//
// Generated from the user's actual axis positions, not template per-archetype.
// Each band combination produces specific copy.

export interface DerivedReading {
  axis: AxisId;
  label: string;
  band: "high" | "mid" | "low";
  strength: string;
  warning: string;
  practice: string;
}

const READINGS: Record<AxisId, Record<"high" | "mid" | "low", { strength: string; warning: string; practice: string }>> = {
  control: {
    high: {
      strength: "You take charge without asking. Decisions land where you stand.",
      warning: "You can mistake compliance for agreement. Silence around you isn't consent — it's calculation.",
      practice: "Once a week, ask the most junior person in the room what you missed. Listen without responding for a full minute.",
    },
    mid: {
      strength: "You take command when needed and let others lead when it serves the outcome. Flexible authority.",
      warning: "Mid-control without anchoring values reads as opportunistic. People aren't sure what you stand for.",
      practice: "Write down three things you will not compromise on. Tell the people who report to you. Hold the line.",
    },
    low: {
      strength: "You move people through influence, not orders. Less resistance, more durable buy-in.",
      warning: "Low-control under pressure becomes deferral. The room waits for someone to decide while you defer up.",
      practice: "Pick one decision a week you would normally route to a manager. Make it yourself. Tell them after.",
    },
  },
  visibility: {
    high: {
      strength: "You want your work seen and you make it easy to see. Recognition multiplies your reach.",
      warning: "High visibility makes you a target. Critics know exactly where to aim. Build armor before you build profile.",
      practice: "For every public win, document one private mistake from the same season. The contrast keeps you honest.",
    },
    mid: {
      strength: "You're seen when it matters and quiet when it doesn't. Your audience is the one whose opinion compounds.",
      warning: "Mid-visibility can read as indecision — neither stage nor backstage. Some rooms want you to pick.",
      practice: "Choose one signature platform (writing, speaking, building publicly) and commit for 12 months. No half-bets.",
    },
    low: {
      strength: "You shape outcomes without claiming credit. Your leverage is invisible to people who would target you.",
      warning: "Low visibility compounds into low recall. People forget the architect of wins they enjoyed.",
      practice: "Once a quarter, claim one win publicly. Specific, dated, attributable. You don't have to do it twice — but do it.",
    },
  },
  timeHorizon: {
    high: {
      strength: "You play decade-long games. Setbacks don't move you because you're not measuring this week.",
      warning: "Strategic patience without execution is the most expensive form of cowardice. You can wait forever.",
      practice: "Pick one bet you've been thinking about for over six months. Ship the v1 this month. Imperfect is the point.",
    },
    mid: {
      strength: "You hold tactical and strategic moves in the same hand. Patience is a tool, not a default.",
      warning: "Mid-horizon without an anchor drifts. The years stack up and the pattern doesn't.",
      practice: "Write a one-paragraph 10-year vision. Read it weekly. Reject moves that don't move you toward it.",
    },
    low: {
      strength: "You move now. You ship before others finish the meeting. Speed compounds.",
      warning: "Speed without restraint burns the relationships and reputation that compound. You exit before the value lands.",
      practice: "Identify one position you would normally exit. Stay in it 12 more months. Compound something.",
    },
  },
  powerSource: {
    high: {
      strength: "Your leverage is consequence. People calculate you before they move. You don't need to repeat yourself.",
      warning: "Force-based power costs you the truth. People stop telling you what you don't want to hear.",
      practice: "Find one person who is not afraid of you. Pay them to tell you what your team is hiding from you.",
    },
    mid: {
      strength: "You mix warmth and weight. People feel both your charm and the cost of crossing you.",
      warning: "Mid power-source can feel inconsistent — sometimes warm, sometimes hard. People don't always know which.",
      practice: "Be deliberate about which mode you use when. Pick a week to lead with warmth, a week to lead with weight. Note the difference.",
    },
    low: {
      strength: "You pull rather than push. People move toward you because of who you are, not what you'd do.",
      warning: "Pure magnetism without consequence creates beautiful systems with no spine. People love you and ignore your asks.",
      practice: "Once a quarter, say the hard 'no' that costs you a relationship. Magnetism survives one true no. It dies of yes.",
    },
  },
};

export const axisLongLabels: Record<AxisId, string> = {
  control: "Control",
  visibility: "Visibility",
  timeHorizon: "Time-Horizon",
  powerSource: "Power-Source",
};

export function deriveReadings(scores: AxisScores): DerivedReading[] {
  const axes: AxisId[] = ["control", "visibility", "timeHorizon", "powerSource"];
  return axes.map((axis) => {
    const value = scores[axis];
    const band: "high" | "mid" | "low" = value <= 33 ? "low" : value >= 67 ? "high" : "mid";
    return {
      axis,
      label: axisLongLabels[axis],
      band,
      ...READINGS[axis][band],
    };
  });
}

// ---------- Helpers ----------

export function topArchetypes(blend: BlendEntry[], n = 3): BlendEntry[] {
  return blend.slice(0, n).filter((x) => x.percent >= 4);
}

export function getArchetype(id: string): Archetype | undefined {
  return archetypes.find((a) => a.id === id);
}
