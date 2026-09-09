import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { ModuleId, Question } from "@/types";
import { MODULE_LABELS, MODULES, TOPIC_CHOICES } from "@/types";
import { StatusBadge } from "@/components/Badges";

type SortKey = "number" | "topic" | "difficulty";

export default function QuestionBank() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const activeModule = MODULES.includes(moduleId as ModuleId) ? (moduleId as ModuleId) : null;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("approved");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [sort, setSort] = useState<SortKey>("number");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listQuestions({
      module: activeModule ?? undefined,
      status: status || undefined,
      topic: topic || undefined,
      difficulty: difficulty || undefined,
      search: search || undefined,
    }).then(setQuestions).finally(() => setLoading(false));
  }, [activeModule, status, topic, difficulty, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of MODULES) c[m] = questions.filter((q) => q.module === m).length;
    return c;
  }, [questions]);

  const sorted = useMemo(() => {
    const copy = [...questions];
    if (sort === "topic") copy.sort((a, b) => a.topic.localeCompare(b.topic));
    else if (sort === "difficulty") copy.sort((a, b) => (a.difficulty ?? "").localeCompare(b.difficulty ?? ""));
    else copy.sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0));
    return copy;
  }, [questions, sort]);

  const topicOptions = activeModule ? TOPIC_CHOICES[activeModule] : Array.from(new Set(MODULES.flatMap((m) => TOPIC_CHOICES[m])));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Question Bank</h1>

      {!moduleId && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {MODULES.map((m) => (
            <button key={m} onClick={() => navigate(`/bank/${m}`)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--accent)]">
              <p className="font-medium">{MODULE_LABELS[m]}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">{counts[m] ?? 0} questions</p>
            </button>
          ))}
        </div>
      )}

      {moduleId && (
        <Link to="/bank" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-4 inline-block">← All modules</Link>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search question text…"
          className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm flex-1 min-w-[180px]"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm">
          <option value="approved">Approved</option>
          <option value="needs_review">Needs Review</option>
          <option value="skipped">Skipped</option>
          <option value="">All statuses</option>
        </select>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm">
          <option value="">All topics</option>
          {topicOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm">
          <option value="">All difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm">
          <option value="number">Sort: Number</option>
          <option value="topic">Sort: Topic</option>
          <option value="difficulty">Sort: Difficulty</option>
        </select>
      </div>

      {loading ? (
        <p className="text-[var(--text-muted)] text-sm">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">No questions match your filters.</p>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {sorted.map((q) => (
            <Link key={q.id} to={`/bank/question/${q.id}`} className="flex items-center gap-4 p-3 hover:bg-[var(--surface-2)]">
              {q.question_image_path ? (
                <img src={q.question_image_path} alt="" className="h-14 w-20 object-cover rounded border border-[var(--border)] bg-white flex-shrink-0" />
              ) : (
                <div className="h-14 w-20 rounded border border-[var(--border)] bg-[var(--surface-2)] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">
                  {!moduleId && `${MODULE_LABELS[q.module]} · `}Q{q.question_number ?? "?"}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{q.question_text?.slice(0, 100) || "(image-based)"}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-[var(--text-muted)]">{q.topic}</span>
                {q.difficulty && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface-2)]">{q.difficulty}</span>}
                <StatusBadge status={q.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
