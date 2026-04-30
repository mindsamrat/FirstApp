import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * Lightweight health check.
 * Hit /api/debug/health to verify Supabase env vars are set + the responses
 * table is reachable from this deployment.
 */
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const hasSecret =
    !!process.env.SUPABASE_SECRET_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  const checks: Record<string, unknown> = {
    SUPABASE_URL: url ? "set" : "MISSING",
    SUPABASE_SECRET_KEY: hasSecret ? "set" : "MISSING",
    DODO_API_KEY: process.env.DODO_API_KEY ? "set" : "MISSING",
    DODO_PRODUCT_ID: process.env.DODO_PRODUCT_ID ? "set" : "MISSING",
    DODO_WEBHOOK_SECRET: process.env.DODO_WEBHOOK_SECRET ? "set" : "MISSING",
  };

  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json(
      { ok: false, env: checks, supabase: "client_not_initialised" },
      { status: 500 }
    );
  }

  const { count, error } = await sb
    .from("responses")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        env: checks,
        supabase: "reachable_but_query_failed",
        error: error.message,
        hint: error.message.includes("does not exist")
          ? "The 'responses' table does not exist. Run the schema SQL in Supabase SQL Editor."
          : "Service role key may be wrong, or table policy is blocking it.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    env: checks,
    supabase: "reachable",
    responses_count: count ?? 0,
  });
}
