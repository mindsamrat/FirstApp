import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface SubscriberRecord {
  id: string;
  email: string;
  archetypeId: string;
  scores: { control: number; visibility: number; timeHorizon: number; powerSource: number };
  pq: number;
  createdAt: string;
  userAgent?: string | null;
  referrer?: string | null;
  source: "free-pdf" | "paid-pdf";
}

/**
 * Writes subscriber records to a newline-delimited JSON file under the OS
 * tempdir by default. On Vercel, local writes disappear between invocations;
 * this is a scaffolding layer meant to be swapped for ConvertKit / Brevo
 * once the environment variable is set.
 */
const STORE_PATH = process.env.PQ_SUBSCRIBER_STORE
  ?? join(process.cwd(), ".pq-subscribers.ndjson");

export async function recordSubscriber(
  data: Omit<SubscriberRecord, "id" | "createdAt">
): Promise<SubscriberRecord> {
  const record: SubscriberRecord = {
    ...data,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  try {
    await fs.appendFile(STORE_PATH, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.warn("[subscriber-store] failed to persist record", err);
  }

  // ConvertKit / Brevo integration point
  if (process.env.CONVERTKIT_API_KEY && process.env.CONVERTKIT_FORM_ID) {
    try {
      await fetch(
        `https://api.convertkit.com/v3/forms/${process.env.CONVERTKIT_FORM_ID}/subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: process.env.CONVERTKIT_API_KEY,
            email: record.email,
            fields: {
              pq_archetype: record.archetypeId,
              pq_score: record.pq,
              pq_control: record.scores.control,
              pq_visibility: record.scores.visibility,
              pq_time_horizon: record.scores.timeHorizon,
              pq_power_source: record.scores.powerSource,
            },
          }),
        }
      );
    } catch (err) {
      console.warn("[subscriber-store] ConvertKit sync failed", err);
    }
  }

  return record;
}
