import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { DashboardData } from "@/types";
import { MODULE_LABELS, MODULES } from "@/types";
import { formatShortSeconds } from "@/lib/time";

const MODULE_ICON: Record<string, string> = {
  figure_sequences: "▦",
  mathematical_equations: "∑",
  latin_squares: "◧",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">dMAT Test Series</h1>
        <p className="text-[var(--text-muted)] mt-1">Practice the dMAT Core Module from your own PDF question banks.</p>
      </div>

      {error && <p className="text-[var(--incorrect)] mb-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {MODULES.map((m) => {
          const summary = data?.modules.find((s) => s.module === m);
          return (
            <Link
              key={m}
              to={`/module/${m}`}
              className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg text-[var(--accent)]">{MODULE_ICON[m]}</span>
                <h2 className="font-semibold">{MODULE_LABELS[m]}</h2>
              </div>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-[var(--text-muted)]">Questions</dt>
                <dd className="text-right font-medium tabular-nums">{summary?.question_count ?? "—"}</dd>
                <dt className="text-[var(--text-muted)]">Full tests available</dt>
                <dd className="text-right font-medium tabular-nums">{summary?.tests_available ?? "—"}</dd>
                <dt className="text-[var(--text-muted)]">Last score</dt>
                <dd className="text-right font-medium tabular-nums">
                  {summary?.last_score_percentage != null ? `${summary.last_score_percentage}%` : "—"}
                </dd>
                <dt className="text-[var(--text-muted)]">Best score</dt>
                <dd className="text-right font-medium tabular-nums text-[var(--correct)]">
                  {summary?.best_score_percentage != null ? `${summary.best_score_percentage}%` : "—"}
                </dd>
              </dl>
            </Link>
          );
        })}
      </div>

      {data && (data.average_accuracy != null || data.average_question_time_seconds != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <Stat label="Average accuracy" value={data.average_accuracy != null ? `${data.average_accuracy}%` : "—"} />
          <Stat label="Average question time" value={data.average_question_time_seconds != null ? formatShortSeconds(data.average_question_time_seconds) : "—"} />
        </div>
      )}

      {data && MODULES.some((m) => (data.topic_breakdown[m] ?? []).length > 0) && (
        <div className="space-y-6">
          <h2 className="font-semibold text-[var(--text-muted)] text-sm uppercase tracking-wide">Performance by Topic</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {MODULES.map((m) => {
              const topics = data.topic_breakdown[m] ?? [];
              if (topics.length === 0) return null;
              const slowest = [...topics].sort((a, b) => b.average_time_seconds - a.average_time_seconds)[0];
              return (
                <div key={m} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h3 className="font-medium text-sm mb-3">{MODULE_LABELS[m]}</h3>
                  <ul className="space-y-1.5">
                    {topics.map((t) => (
                      <li key={t.topic} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-muted)]">{t.topic}</span>
                        <span className="font-medium tabular-nums">{t.accuracy}%</span>
                      </li>
                    ))}
                  </ul>
                  {slowest && (
                    <p className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
                      Slowest topic: <span className="font-medium text-[var(--warning)]">{slowest.topic}</span> — {formatShortSeconds(slowest.average_time_seconds)} average
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
    </div>
  );
}
