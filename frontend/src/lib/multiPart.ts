/** Multi-part questions (e.g. "Matrix 5" + "Matrix 6" both asked in one
 * question) and multi-variable fill-in questions (e.g. "A = ? • B = ? • C =
 * ? • D = ?") both store their answer as a JSON object — {partLabel: choice}
 * or {variable: value} respectively — encoded into the same string field a
 * single-answer question would use a plain string for. These helpers keep
 * that encoding in one place, shared by both. */

export function encodePartAnswers(byLabel: Record<string, string>): string | null {
  const entries = Object.entries(byLabel).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return JSON.stringify(Object.fromEntries(entries));
}

export function decodePartAnswers(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}
