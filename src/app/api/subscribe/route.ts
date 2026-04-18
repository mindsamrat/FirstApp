import { NextResponse } from "next/server";
import { validateEmail } from "@/lib/email-validation";
import { recordSubscriber } from "@/lib/subscriber-store";
import { getArchetypeById } from "@/data/archetypes";

export const runtime = "nodejs";

interface SubscribePayload {
  email: string;
  archetypeId: string;
  scores: { control: number; visibility: number; timeHorizon: number; powerSource: number };
  pq: number;
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

  const emailCheck = validateEmail(body.email ?? "");
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

  const record = await recordSubscriber({
    email: emailCheck.normalized,
    archetypeId: archetype.id,
    scores,
    pq: clampScore(body.pq),
    source: body.source === "paid-pdf" ? "paid-pdf" : "free-pdf",
    userAgent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
  });

  const qs = new URLSearchParams({
    id: archetype.id,
    c: String(scores.control),
    v: String(scores.visibility),
    t: String(scores.timeHorizon),
    p: String(scores.powerSource),
    pq: String(clampScore(body.pq)),
    token: record.id,
  });

  return NextResponse.json({
    ok: true,
    downloadUrl: `/api/pdf/free?${qs.toString()}`,
  });
}
