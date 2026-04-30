import { questions } from "@/data/questions";
import { getCentroid, type Archetype } from "@/data/archetypes";
import type { AxisScores } from "@/lib/scoring";

export interface StoredAnswer {
  q: string;
  o: string;
  d: AxisScores;
}

export interface SignatureAnswer {
  questionId: string;
  optionId: string;
  prompt: string;
  optionText: string;
  /** How much the delta pulled the user toward the archetype's centroid. */
  pullScore: number;
}

export function computeSignatureAnswers(
  archetype: Archetype,
  answers: StoredAnswer[]
): SignatureAnswer[] {
  const target = getCentroid(archetype);
  const start = { control: 50, visibility: 50, timeHorizon: 50, powerSource: 50 };

  const scored = answers
    .map((a) => {
      const before = dist(start, target);
      const after = dist(
        {
          control: start.control + a.d.control,
          visibility: start.visibility + a.d.visibility,
          timeHorizon: start.timeHorizon + a.d.timeHorizon,
          powerSource: start.powerSource + a.d.powerSource,
        },
        target
      );
      const pull = before - after;
      const q = questions.find((qq) => qq.id === a.q);
      if (!q || q.kind === "free-text" || q.kind === "email") return null;
      const option = q.options.find((o) => o.id === a.o);
      if (!option) return null;
      return {
        questionId: a.q,
        optionId: a.o,
        prompt: q.prompt,
        optionText: option.text,
        pullScore: pull,
      };
    })
    .filter((x): x is SignatureAnswer => x !== null);

  return scored.sort((x, y) => y.pullScore - x.pullScore).slice(0, 3);
}

function dist(a: AxisScores, b: AxisScores): number {
  return Math.hypot(
    a.control - b.control,
    a.visibility - b.visibility,
    a.timeHorizon - b.timeHorizon,
    a.powerSource - b.powerSource
  );
}
