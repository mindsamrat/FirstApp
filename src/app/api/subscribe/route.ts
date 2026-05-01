import { NextResponse } from "next/server";
import { validateEmail } from "@/lib/email-validation";
import { recordSubscriber } from "@/lib/subscriber-store";
import { saveResponseToSupabase } from "@/lib/supabase-server";
import { getArchetypeById } from "@/data/archetypes";

export const runtime = "nodejs";

interface AnswerEntry {
  q: string;
  o: string;
  d: { control: number; visibility: number; timeHorizon: number; powerSource: number };
}

interface FreeTextEntry {
  questionId: string;
  text: string;
}

interface SubscribePayload {
  email: string;
  archetypeId: string;
  scores: { control: number; visibility: number; timeHorizon: number; powerSource: number };
  pq: number;
  answers?: AnswerEntry[];
  freeText?: FreeTextEntry[];
  source?: "free-pdf" | "paid-pdf";
  honeypot?: string;
}

function clampScore(n: unknown): number {
  const parsed = Number(n);
  if (Number.isNaN(parsed)) return 50;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export async function POST(req: Request) {
  let body: Partial<SubscribePayload>;
  try {
    body = (await req.json()) as Partial<SubscribePayload>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (body.honeypot) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const emailCheck = await validateEmail(body.email ?? "");
  if (!emailCheck.valid || !emailCheck.normalized) {
    return NextResponse.json({ error: emailCheck.error ?? "Invalid email." }, { status: 400 });
  }

  const archetype = body.archetypeId ? getArchetypeById(body.archetypeId) : undefined;
  if (!archetype) {
    return NextResponse.json({ error: "Unknown archetype." }, { status: 400 });
  }

  const scores = {
    control: clampScore(body.scores?.control),
    visibility: clampScore(body.scores?.visibility),
    timeHorizon: clampScore(body.scores?.timeHorizon),
    powerSource: clampScore(body.scores?.powerSource),
  };
  const pq = clampScore(body.pq);
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const freeText = Array.isArray(body.freeText) ? body.freeText : [];

  const userAgent = req.headers.get("user-agent");
  const referrer = req.headers.get("referer");
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : null;

  // Primary: write to Supabase if configured. If env is set but the write
  // fails (RLS, schema mismatch, etc.) — surface the error so the user sees
  // it instead of silently falling through to the local NDJSON scaffold.
  const supabaseConfigured = !!(process.env.SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

  let responseId: string | null = null;
  if (supabaseConfigured) {
    try {
      responseId = await saveResponseToSupabase({
        email: emailCheck.normalized,
        archetypeId: archetype.id,
        pq,
        scores,
        answers,
        freeText,
        userAgent,
        ipAddress: ip,
      });
    } catch (err) {
      console.error("[subscribe] supabase write failed", err);
      return NextResponse.json(
        {
          error: `Could not save your response: ${err instanceof Error ? err.message : "unknown error"}`,
        },
        { status: 500 }
      );
    }
  }

  if (!responseId) {
    // Supabase not configured -> dev fallback to keep local quiz testing alive.
    const record = await recordSubscriber({
      email: emailCheck.normalized,
      archetypeId: archetype.id,
      scores,
      pq,
      source: body.source === "paid-pdf" ? "paid-pdf" : "free-pdf",
      userAgent,
      referrer,
    });
    responseId = record.id;
  }

  const qs = new URLSearchParams({
    id: archetype.id,
    c: String(scores.control),
    v: String(scores.visibility),
    t: String(scores.timeHorizon),
    p: String(scores.powerSource),
    pq: String(pq),
    token: responseId.slice(0, 8),
  });

  return NextResponse.json({
    ok: true,
    responseId,
    downloadUrl: `/api/pdf/free?${qs.toString()}`,
  });
}
