import { NextResponse } from "next/server";
import { getResponseById } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * Lightweight read-only endpoint used by the /paid page to poll for
 * payment status while the Dodo webhook flips the row from `unpaid` -> `paid`.
 *
 * Returns only the fields the client needs; never echoes user_agent / ip.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const row = await getResponseById(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    archetype_id: row.archetype_id,
    pq_score: row.pq_score,
    scores: row.scores,
    payment_status: row.payment_status,
    pdf_url: row.pdf_url,
    paid_at: row.paid_at,
  });
}
