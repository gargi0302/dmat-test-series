import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { Test } from "@/types";
import { MODULE_LABELS } from "@/types";
import { formatMMSS, formatShortSeconds } from "@/lib/time";

export default function History() {
  const [tests, setTests] = useState<Test[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    api.listTests({}).then(setTests);
  };
  useEffect(load, []);

  const doDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.deleteTest(id);
      setTests((ts) => ts?.filter((t) => t.id !== id) ?? ts);
    } finally {
      setDeleting(null);
      setConfirmId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Test History</h1>

      {!tests ? (
        <p className="text-[var(--text-muted)] text-sm">Loading…</p>
      ) : tests.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">No tests yet.</p>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {tests.map((t) => {
            const total = t.question_ids.length;
            const score = t.score ?? 0;
            const pct = total ? Math.round((score / total) * 100) : 0;
            const avgTime = t.total_time_seconds && total ? t.total_time_seconds / total : 0;
            const linkTo = t.status === "in_progress" ? `/tests/${t.id}/run` : `/tests/${t.id}/review`;
            return (
              <div key={t.id} className="flex items-center justify-between gap-4 p-4 hover:bg-[var(--surface-2)]">
                <Link to={linkTo} className="flex-1 min-w-0">
                  <p className="font-medium flex items-center gap-2">
                    {MODULE_LABELS[t.module]} <span className="text-[var(--text-muted)] font-normal capitalize">· {t.mode}</span>
                    {t.status !== "completed" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--warning-soft)] text-[var(--warning)] capitalize">{t.status.replace("_", " ")}</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {new Date(t.completed_at ?? t.created_at).toLocaleString()} · {total} Questions
                  </p>
                </Link>
                {t.status === "completed" && (
                  <div className="flex items-center gap-6 text-sm flex-shrink-0">
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{score}/{total}</p>
                      <p className="text-xs text-[var(--text-muted)]">{pct}%</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatMMSS(t.total_time_seconds ?? 0)}</p>
                      <p className="text-xs text-[var(--text-muted)]">{formatShortSeconds(avgTime)}/q</p>
                    </div>
                  </div>
                )}
                {confirmId === t.id ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => doDelete(t.id)}
                      disabled={deleting === t.id}
                      className="px-2.5 py-1.5 rounded-md bg-[var(--incorrect)] text-white text-xs font-medium disabled:opacity-50"
                    >
                      {deleting === t.id ? "Deleting…" : "Confirm"}
                    </button>
                    <button onClick={() => setConfirmId(null)} className="px-2.5 py-1.5 rounded-md border border-[var(--border)] text-xs font-medium">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(t.id)}
                    title="Delete this test"
                    className="flex-shrink-0 h-8 w-8 rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--incorrect)] hover:border-[var(--incorrect)] flex items-center justify-center"
                  >
                    🗑
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
