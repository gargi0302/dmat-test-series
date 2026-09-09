import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { ScoreSummary } from "@/types";
import { formatMMSS, formatShortSeconds } from "@/lib/time";

export default function TestResults() {
  const { testId } = useParams<{ testId: string }>();
  const [summary, setSummary] = useState<ScoreSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!testId) return;
    api.getResults(testId).then(setSummary).catch((e) => setError(e.message));
  }, [testId]);

  if (error) return <div className="max-w-2xl mx-auto px-6 py-10 text-[var(--incorrect)]">{error}</div>;
  if (!summary || !testId) return <div className="max-w-2xl mx-auto px-6 py-10 text-[var(--text-muted)]">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Test Complete</h1>
        <p className="text-5xl font-bold mt-4 tabular-nums">
          {summary.score} <span className="text-2xl text-[var(--text-muted)] font-normal">/ {summary.total}</span>
        </p>
        <p className="text-lg text-[var(--accent)] font-semibold mt-1">{summary.percentage}%</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Correct" value={summary.correct} tone="good" />
        <Stat label="Incorrect" value={summary.incorrect} tone="bad" />
        <Stat label="Unanswered" value={summary.unanswered} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <Stat label="Total Time" value={formatMMSS(summary.total_time_seconds)} />
        <Stat label="Avg Time / Question" value={formatShortSeconds(summary.average_time_seconds)} />
        <Stat label="Fastest Question" value={summary.fastest_question_number ? `Q${summary.fastest_question_number}` : "—"} />
        <Stat label="Slowest Question" value={summary.slowest_question_number ? `Q${summary.slowest_question_number}` : "—"} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link to={`/tests/${testId}/review`} className="flex-1 text-center py-2.5 rounded-md bg-[var(--accent)] text-white font-semibold text-sm">
          Side-by-Side Review
        </Link>
        <Link to={`/tests/${testId}/analysis`} className="flex-1 text-center py-2.5 rounded-md border border-[var(--border)] font-semibold text-sm hover:bg-[var(--surface-2)]">
          Performance Analysis
        </Link>
        <Link to="/" className="flex-1 text-center py-2.5 rounded-md border border-[var(--border)] font-semibold text-sm hover:bg-[var(--surface-2)]">
          Dashboard
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-[var(--correct)]" : tone === "bad" ? "text-[var(--incorrect)]" : "text-[var(--text)]";
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
      <p className={`text-xl font-bold tabular-nums ${cls}`}>{value}</p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
    </div>
  );
}
