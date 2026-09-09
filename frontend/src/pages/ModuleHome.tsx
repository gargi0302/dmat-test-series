import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { useSettingsStore } from "@/store/settingsStore";
import type { ModuleId, Test } from "@/types";
import { MODULE_LABELS, MODULES } from "@/types";

export default function ModuleHome() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { settings, load, loaded } = useSettingsStore();

  const module = MODULES.includes(moduleId as ModuleId) ? (moduleId as ModuleId) : null;

  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [inProgress, setInProgress] = useState<Test | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customCount, setCustomCount] = useState(10);
  const [customDifficulty, setCustomDifficulty] = useState("");
  const [customOrder, setCustomOrder] = useState<"sequential" | "random">("sequential");

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    if (!module) return;
    api.listQuestions({ module, status: "approved" }).then((qs) => setApprovedCount(qs.length));
    api.listTests({ module, status: "in_progress" }).then((ts) => setInProgress(ts[0] ?? null));
  }, [module]);

  if (!module) {
    return <div className="max-w-3xl mx-auto px-6 py-10">Unknown module.</div>;
  }

  const start = async (mode: "full" | "custom" | "practice") => {
    setError(null);
    setStarting(true);
    try {
      const payload =
        mode === "full"
          ? { module, mode: "full" as const }
          : mode === "practice"
            ? { module, mode: "practice" as const, order: "sequential" as const }
            : {
                module,
                mode: "custom" as const,
                question_count: customCount,
                difficulty: customDifficulty || undefined,
                order: customOrder,
              };
      const test = await api.createTest(payload);
      navigate(`/tests/${test.id}/run`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const abandonAndStartNew = async () => {
    if (inProgress) await api.abandonTest(inProgress.id);
    setInProgress(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Link to="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">← Dashboard</Link>
      <div className="flex items-center justify-between mt-2 mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{MODULE_LABELS[module]}</h1>
        <Link
          to={`/module/${module}/upload`}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Upload Question Bank
        </Link>
      </div>

      {approvedCount === 0 && (
        <div className="mb-6 p-4 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] text-sm">
          No approved questions yet for this module.{" "}
          <Link to={`/module/${module}/upload`} className="font-medium underline">Upload a question bank</Link> to get started.
        </div>
      )}

      {inProgress && (
        <div className="mb-6 p-4 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)]">
          <p className="font-medium mb-2">Resume Test?</p>
          <p className="text-sm text-[var(--text-muted)] mb-3">You have an unfinished {inProgress.mode} test in this module.</p>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/tests/${inProgress.id}/run`)}
              className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm font-medium"
            >
              Resume
            </button>
            <button onClick={abandonAndStartNew} className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm">
              Abandon
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[var(--incorrect)] text-sm mb-4">{error}</p>}

      <div className="space-y-4">
        <TestModeCard title="Full Test" description={`${settings.default_question_count} questions · ${settings.default_timer_minutes} minute timer · matches the standard diagnostic format`}>
          <button
            disabled={starting || !approvedCount}
            onClick={() => start("full")}
            className="px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-50"
          >
            Start Full Test
          </button>
        </TestModeCard>

        <TestModeCard title="Custom Test" description="Choose the number of questions, difficulty, and question order.">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <label className="text-sm flex items-center gap-2">
              Questions
              <input
                type="number"
                min={1}
                max={approvedCount ?? 1}
                value={customCount}
                onChange={(e) => setCustomCount(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)]"
              />
            </label>
            <label className="text-sm flex items-center gap-2">
              Difficulty
              <select
                value={customDifficulty}
                onChange={(e) => setCustomDifficulty(e.target.value)}
                className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)]"
              >
                <option value="">Any</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </label>
            <label className="text-sm flex items-center gap-2">
              Order
              <select
                value={customOrder}
                onChange={(e) => setCustomOrder(e.target.value as "sequential" | "random")}
                className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)]"
              >
                <option value="sequential">Sequential</option>
                <option value="random">Random</option>
              </select>
            </label>
          </div>
          <button
            disabled={starting || !approvedCount}
            onClick={() => start("custom")}
            className="px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-50"
          >
            Start Custom Test
          </button>
        </TestModeCard>

        <TestModeCard title="Practice Mode" description="No overall time limit — time is still tracked per question.">
          <button
            disabled={starting || !approvedCount}
            onClick={() => start("practice")}
            className="px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-50"
          >
            Start Practice
          </button>
        </TestModeCard>
      </div>
    </div>
  );
}

function TestModeCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-semibold mb-1">{title}</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">{description}</p>
      {children}
    </div>
  );
}
