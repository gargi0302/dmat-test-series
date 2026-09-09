import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { TestDetail } from "@/types";
import { MODULE_LABELS } from "@/types";
import { formatMMSS, formatShortSeconds } from "@/lib/time";
import { ResultTag } from "@/components/Badges";
import { decodePartAnswers } from "@/lib/multiPart";
import type { Question } from "@/types";

type Filter = "all" | "incorrect" | "slow" | "unanswered" | "correct" | "marked";

function formatAnswer(raw: string | null, question: Question): string {
  const labels = question.parts?.length ? question.parts.map((p) => p.label) : question.variables;
  if (!labels?.length) return raw ?? "—";
  const decoded = decodePartAnswers(raw);
  return labels.map((l) => `${l}: ${decoded[l] ?? "—"}`).join(", ");
}

export default function PerformanceAnalysis() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!testId) return;
    api.getTest(testId).then(setTest).catch((e) => setError(e.message));
  }, [testId]);

  const slowThreshold = (test?.settings_snapshot?.slow_threshold_seconds as number | undefined) ?? 75;

  const rows = useMemo(() => {
    if (!test) return [];
    return test.questions.map((q, i) => {
      const a = test.attempts.find((att) => att.question_id === q.id)!;
      const unanswered = !a.selected_answer;
      const slow = a.time_spent_seconds > slowThreshold;
      return { index: i, question: q, attempt: a, unanswered, slow };
    });
  }, [test, slowThreshold]);

  const filtered = rows.filter((r) => {
    switch (filter) {
      case "incorrect": return r.attempt.is_correct === false;
      case "slow": return r.slow;
      case "unanswered": return r.unanswered;
      case "correct": return r.attempt.is_correct === true;
      case "marked": return r.attempt.marked_for_review;
      default: return true;
    }
  });

  if (error) return <div className="max-w-4xl mx-auto px-6 py-10 text-[var(--incorrect)]">{error}</div>;
  if (!test) return <div className="max-w-4xl mx-auto px-6 py-10 text-[var(--text-muted)]">Loading…</div>;

  const times = rows.map((r) => r.attempt.time_spent_seconds).filter((t) => t > 0).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : 0;
  const total = rows.length;
  const correct = rows.filter((r) => r.attempt.is_correct).length;
  const totalTime = rows.reduce((s, r) => s + r.attempt.time_spent_seconds, 0);
  const avg = total ? totalTime / total : 0;
  const fastest = times[0];
  const slowest = times[times.length - 1];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link to={`/tests/${test.id}/results`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">← Results</Link>
      <h1 className="text-2xl font-bold tracking-tight mt-2 mb-6">Performance Analysis — {MODULE_LABELS[test.module]}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Score" value={`${correct}/${total}`} />
        <Stat label="Accuracy" value={`${total ? Math.round((correct / total) * 100) : 0}%`} />
        <Stat label="Total Time" value={formatMMSS(totalTime)} />
        <Stat label="Avg Time" value={formatShortSeconds(avg)} />
        <Stat label="Median Time" value={formatShortSeconds(median)} />
        <Stat label="Fastest" value={fastest != null ? formatShortSeconds(fastest) : "—"} />
        <Stat label="Slowest" value={slowest != null ? formatShortSeconds(slowest) : "—"} />
        <Stat label="Slow Threshold" value={formatShortSeconds(slowThreshold)} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(["all", "correct", "incorrect", "unanswered", "slow", "marked"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border ${filter === f ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]"}`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)] uppercase tracking-wide">
              <th className="px-4 py-2.5">Q</th>
              <th className="px-4 py-2.5">Result</th>
              <th className="px-4 py-2.5">Time</th>
              <th className="px-4 py-2.5">Your Answer</th>
              <th className="px-4 py-2.5">Correct</th>
              <th className="px-4 py-2.5">Topic</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.question.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-2.5 font-medium tabular-nums">Q{r.index + 1}</td>
                <td className="px-4 py-2.5"><ResultTag isCorrect={r.attempt.is_correct} unanswered={r.unanswered} slow={r.slow} /></td>
                <td className={`px-4 py-2.5 tabular-nums ${r.slow ? "text-[var(--warning)] font-medium" : ""}`}>{formatMMSS(r.attempt.time_spent_seconds)}</td>
                <td className="px-4 py-2.5">{formatAnswer(r.attempt.selected_answer, r.question)}</td>
                <td className="px-4 py-2.5">{formatAnswer(r.attempt.correct_answer_snapshot, r.question)}</td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.question.topic}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">No questions match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
