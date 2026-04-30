import { questions, type Question, type ChoiceQuestion, type FreeTextQuestion, type EmailQuestion, type OptionId } from "@/data/questions";
import { calculateAxisScores, matchArchetype, computePQ, type AnswerDelta, type AxisScores, type MatchResult } from "@/lib/scoring";

export interface ChoiceAnswer {
  questionId: string;
  optionId: OptionId;
  delta: AnswerDelta;
}

export interface FreeTextAnswer {
  questionId: string;
  text: string;
}

export interface QuizProgress {
  served: string[];
  choiceAnswers: ChoiceAnswer[];
  freeTextAnswers: FreeTextAnswer[];
}

export function emptyProgress(): QuizProgress {
  return { served: [], choiceAnswers: [], freeTextAnswers: [] };
}

const calibration = questions.filter((q): q is ChoiceQuestion => q.kind === "calibration");
const branched = questions.filter((q): q is ChoiceQuestion => q.kind === "branched");
const tiebreakers = questions.filter((q): q is ChoiceQuestion => q.kind === "tiebreaker");
const freeText = questions.filter((q): q is FreeTextQuestion => q.kind === "free-text");
const email = questions.filter((q): q is EmailQuestion => q.kind === "email");

/**
 * Build the served-question plan for this user.
 *
 * Order:
 *   1. Calibration (5)  — fixed, all users see these in the same order
 *   2. Branched pool    — currently all served; will sub-select once bank grows past ~30
 *   3. Tiebreakers      — currently all served; will be conditional on score gap
 *   4. Free-text        — optional descriptive prompts
 *   5. Email            — required final step before results unlock
 */
export function buildQuizPlan(_seed?: string): Question[] {
  void _seed;
  return [...calibration, ...branched, ...tiebreakers, ...freeText, ...email];
}

export function getQuestionById(id: string): Question | undefined {
  return questions.find((q) => q.id === id);
}

export function deltaFromChoice(question: ChoiceQuestion, optionId: OptionId): AnswerDelta {
  const option = question.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown option ${optionId} on ${question.id}`);
  return {
    control: option.scores.control ?? 0,
    visibility: option.scores.visibility ?? 0,
    timeHorizon: option.scores.timeHorizon ?? 0,
    powerSource: option.scores.powerSource ?? 0,
  };
}

export interface FinalResult {
  match: MatchResult;
  scores: AxisScores;
  pq: number;
  freeText: FreeTextAnswer[];
}

export function finalize(progress: QuizProgress): FinalResult {
  const deltas = progress.choiceAnswers.map((a) => a.delta);
  const scores = calculateAxisScores(deltas);
  const match = matchArchetype(scores);
  const pq = computePQ(scores);
  return { match, scores, pq, freeText: progress.freeTextAnswers };
}
