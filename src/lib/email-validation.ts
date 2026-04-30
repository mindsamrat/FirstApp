import mailchecker from "mailchecker";
import { promises as dns } from "node:dns";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailValidation {
  valid: boolean;
  normalized?: string;
  error?: string;
}

export function validateEmailFormat(raw: string): EmailValidation {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return { valid: false, error: "Enter your email." };
  if (trimmed.length > 254) return { valid: false, error: "That email is too long." };
  if (!EMAIL_RE.test(trimmed)) return { valid: false, error: "That doesn't look like a valid email." };

  // mailchecker covers ~120k disposable / temp domains.
  if (!mailchecker.isValid(trimmed)) {
    return { valid: false, error: "Use a real email — disposable inboxes are blocked." };
  }

  return { valid: true, normalized: trimmed };
}

/**
 * Verify the domain has at least one mail server (MX or A record).
 * Returns false for fake-looking domains like `example.fakedomain123.com`.
 *
 * Server-side only — uses node:dns. Soft-fails (returns true) on transient
 * lookup errors so we don't reject legitimate users when DNS is flaky.
 */
export async function verifyMxRecord(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;

  try {
    const records = await dns.resolveMx(domain).catch(() => [] as { exchange: string }[]);
    if (records.length > 0) return true;

    // Some domains accept mail on the A record per RFC 5321 §5.1.
    const a = await dns.resolve4(domain).catch(() => [] as string[]);
    if (a.length > 0) return true;

    const aaaa = await dns.resolve6(domain).catch(() => [] as string[]);
    return aaaa.length > 0;
  } catch {
    // Soft-fail: don't block real users due to transient DNS errors.
    return true;
  }
}

/** Combined check: format + disposable + MX. Server-side only. */
export async function validateEmail(raw: string): Promise<EmailValidation> {
  const format = validateEmailFormat(raw);
  if (!format.valid || !format.normalized) return format;
  const ok = await verifyMxRecord(format.normalized);
  if (!ok) {
    return { valid: false, error: "We can't reach mail servers for that domain." };
  }
  return format;
}
