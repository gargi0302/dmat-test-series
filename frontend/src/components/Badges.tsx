import type { Confidence, QuestionStatus } from "@/types";

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const map: Record<Confidence, [string, string]> = {
    high: ["High confidence", "text-[var(--correct)] bg-[var(--correct-soft)]"],
    medium: ["Medium confidence", "text-[var(--warning)] bg-[var(--warning-soft)]"],
    low: ["Low confidence — verify", "text-[var(--incorrect)] bg-[var(--incorrect-soft)]"],
    none: ["No answer detected", "text-[var(--text-muted)] bg-[var(--surface-2)]"],
  };
  const [label, cls] = map[confidence];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

export function StatusBadge({ status }: { status: QuestionStatus }) {
  const map: Record<QuestionStatus, [string, string]> = {
    needs_review: ["Needs Review", "text-[var(--warning)] bg-[var(--warning-soft)]"],
    approved: ["✓ Approved", "text-[var(--correct)] bg-[var(--correct-soft)]"],
    skipped: ["Skipped", "text-[var(--text-muted)] bg-[var(--surface-2)]"],
  };
  const [label, cls] = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

export function ResultTag({
  isCorrect, unanswered, slow,
}: { isCorrect: boolean | null; unanswered: boolean; slow?: boolean }) {
  if (unanswered) return <span className="text-[var(--text-muted)]">— Unanswered</span>;
  if (isCorrect === null) return <span className="text-[var(--text-muted)]">— Ungraded</span>;
  if (isCorrect && slow) return <span className="text-[var(--warning)] font-medium">⚠ Correct but Slow</span>;
  if (isCorrect) return <span className="text-[var(--correct)] font-medium">✓ Correct{slow === false ? " + Fast" : ""}</span>;
  return <span className="text-[var(--incorrect)] font-medium">✗ Wrong</span>;
}
