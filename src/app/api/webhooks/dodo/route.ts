import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getResponseById, markResponsePaid } from "@/lib/supabase-server";

export const runtime = "nodejs";

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Dodo Payments webhook handler.
 *
 * URL to register in Dodo dashboard:
 *   https://quiz.wayofgods.com/api/webhooks/dodo
 *
 * Subscribe to these events:
 *   - payment.succeeded   -> mark response paid + (later) trigger paid-PDF generation
 *   - payment.failed      -> logged for ops (declined card, etc.)
 *   - payment.cancelled   -> logged only (user bailed mid-checkout)
 *
 * Protection layers:
 *   1. HMAC-SHA256 signature verification with DODO_WEBHOOK_SECRET
 *      (constant-time comparison — no timing attack surface)
 *   2. Replay protection — if the request carries a timestamp header,
 *      reject events older than 5 minutes
 *   3. Idempotency — payment.succeeded checks current row state before
 *      re-marking; replays don't double-process
 */
export async function POST(req: Request) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[dodo-webhook] DODO_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const rawBody = await req.text();

  // ---- Replay protection ----
  const tsHeader =
    req.headers.get("webhook-timestamp") ??
    req.headers.get("dodo-timestamp") ??
    req.headers.get("x-dodo-timestamp");
  if (tsHeader) {
    const tsMs = Number(tsHeader) * (tsHeader.length <= 10 ? 1000 : 1);
    if (!Number.isNaN(tsMs)) {
      const drift = Math.abs(Date.now() - tsMs);
      if (drift > REPLAY_WINDOW_MS) {
        console.warn("[dodo-webhook] rejected stale event, drift =", drift, "ms");
        return NextResponse.json({ error: "stale event" }, { status: 401 });
      }
    }
  }

  // ---- Signature verification ----
  const signatureHeader =
    req.headers.get("webhook-signature") ??
    req.headers.get("dodo-signature") ??
    req.headers.get("x-dodo-signature") ??
    "";

  if (!signatureHeader) {
    return NextResponse.json({ error: "missing signature" }, { status: 401 });
  }

  // Some providers prefix with `sha256=` or `t=...,v1=...` -> grab the last hex token.
  const cleaned = signatureHeader
    .replace(/^sha256=/i, "")
    .replace(/.*v1=/, "")
    .trim();

  // Some providers sign `${timestamp}.${body}` instead of just body.
  const candidates = [
    rawBody,
    tsHeader ? `${tsHeader}.${rawBody}` : null,
  ].filter((x): x is string => x !== null);

  let ok = false;
  for (const payload of candidates) {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    try {
      if (cleaned.length === expected.length) {
        if (
          timingSafeEqual(
            Buffer.from(cleaned, "hex"),
            Buffer.from(expected, "hex")
          )
        ) {
          ok = true;
          break;
        }
      }
    } catch { /* fall through */ }
  }

  if (!ok) {
    console.warn("[dodo-webhook] invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // ---- Parse + dispatch ----
  let event: { type?: string; event_type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = event.type ?? event.event_type ?? "";
  const data = (event.data ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const responseId = typeof metadata.response_id === "string" ? metadata.response_id : null;

  // ---- payment.succeeded ----
  if (type === "payment.succeeded" || type === "payment.completed") {
    if (!responseId) {
      console.warn("[dodo-webhook] succeeded event missing response_id metadata");
      return NextResponse.json({ ok: true, note: "no response_id" });
    }

    // Idempotency guard: if this row is already paid, skip the re-write.
    const existing = await getResponseById(responseId);
    if (existing?.payment_status === "paid") {
      return NextResponse.json({ ok: true, idempotent: true, responseId });
    }

    const updated = await markResponsePaid(responseId, "");
    return NextResponse.json({ ok: true, updated, responseId });
  }

  // ---- payment.failed ----
  if (type === "payment.failed") {
    console.log("[dodo-webhook] payment.failed", { responseId, data });
    return NextResponse.json({ ok: true });
  }

  // ---- payment.cancelled ----
  if (type === "payment.cancelled" || type === "payment.canceled") {
    console.log("[dodo-webhook] payment.cancelled", { responseId });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: type });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Dodo Payments webhook endpoint. POST signed events here.",
  });
}
