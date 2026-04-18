const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Small starter blocklist; replaced by mailchecker package in Phase 5.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "throwaway.email",
  "yopmail.com",
  "trashmail.com",
  "fakeinbox.com",
  "getnada.com",
  "sharklasers.com",
]);

export interface EmailValidation {
  valid: boolean;
  normalized?: string;
  error?: string;
}

export function validateEmail(raw: string): EmailValidation {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return { valid: false, error: "Enter your email." };
  if (trimmed.length > 254) return { valid: false, error: "That email is too long." };
  if (!EMAIL_RE.test(trimmed)) return { valid: false, error: "That doesn't look like a valid email." };

  const domain = trimmed.split("@")[1];
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, error: "Use a permanent email address." };
  }
  return { valid: true, normalized: trimmed };
}
