import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Server-only Supabase client backed by the SECRET / service-role key.
 * Returns null if env vars aren't configured so callers can fall back gracefully.
 */
export function getServerSupabase(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export interface ResponseRow {
  name: string;
  email: string;
  archetypeId: string;
  pq: number;
  scores: { control: number; visibility: number; timeHorizon: number; powerSource: number };
  answers: { q: string; o: string; d: { control: number; visibility: number; timeHorizon: number; powerSource: number } }[];
  freeText: { questionId: string; text: string }[];
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** Insert a quiz response into Supabase. Returns the new row's UUID. Throws on configured-but-failing writes. */
export async function saveResponseToSupabase(row: ResponseRow): Promise<string | null> {
  const sb = getServerSupabase();
  if (!sb) return null; // env not configured -> caller decides fallback

  const { data, error } = await sb
    .from("responses")
    .insert({
      name: row.name,
      email: row.email,
      archetype_id: row.archetypeId,
      pq_score: row.pq,
      scores: row.scores,
      answers: row.answers,
      free_text: row.freeText,
      user_agent: row.userAgent ?? null,
      ip_address: row.ipAddress ?? null,
      payment_status: "unpaid",
    })
    .select("id")
    .single();

  if (error) {
    // Surface the real error so /api/subscribe can include it in its 500 response
    // instead of silently falling back to local storage.
    throw new Error(error.message || "supabase insert failed");
  }
  return data?.id ?? null;
}

/** Update payment status and stored PDF URL after a successful Dodo webhook. */
export async function markResponsePaid(
  responseId: string,
  pdfUrl: string
): Promise<boolean> {
  const sb = getServerSupabase();
  if (!sb) return false;

  const { error } = await sb
    .from("responses")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      pdf_url: pdfUrl,
    })
    .eq("id", responseId);

  if (error) {
    console.error("[supabase] mark paid failed", error);
    return false;
  }
  return true;
}

/** Read a response by id (for the paid PDF generator). */
export async function getResponseById(responseId: string) {
  const sb = getServerSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("responses")
    .select("*")
    .eq("id", responseId)
    .single();

  if (error) {
    console.error("[supabase] read response failed", error);
    return null;
  }
  return data;
}
