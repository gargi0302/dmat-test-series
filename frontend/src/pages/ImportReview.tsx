import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { ImportBatch, ImportBatchDetail, Question } from "@/types";
import { MODULE_LABELS, TOPIC_CHOICES } from "@/types";
import { ConfidenceBadge, StatusBadge } from "@/components/Badges";
import { QuestionVisual, OptionGrid, MultiPartOptionGrid } from "@/components/QuestionView";
import { decodePartAnswers, encodePartAnswers } from "@/lib/multiPart";

export default function ImportReview() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<ImportBatchDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [otherApprovedBatches, setOtherApprovedBatches] = useState<ImportBatch[]>([]);

  const load = () => {
    if (!batchId) return;
    api.getImport(batchId).then((b) => {
      setBatch(b);
      api.listImports(b.module).then((all) =>
        setOtherApprovedBatches(all.filter((x) => x.id !== b.id && x.approved_count > 0)),
      );
    }).catch((e) => setError(e.message));
  };
  useEffect(load, [batchId]);

  // Approve/Skip jump to the next question, which can be a very different
  // height (e.g. a tall multi-part question followed by a short one) — without
  // this, the page kept its old scroll position and landed the reviewer
  // somewhere inside the new question's middle rather than its top, making it
  // look like nothing happened or the question was "cut off".
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [index]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (error) return <div className="max-w-3xl mx-auto px-6 py-10 text-[var(--incorrect)]">{error}</div>;
  if (!batch) return <div className="max-w-3xl mx-auto px-6 py-10 text-[var(--text-muted)]">Loading…</div>;
  if (batch.questions.length === 0) return <div className="max-w-3xl mx-auto px-6 py-10">No questions in this batch.</div>;

  const q = batch.questions[index];

  const updateLocal = (updated: Question) => {
    setBatch((b) => (b ? { ...b, questions: b.questions.map((x) => (x.id === updated.id ? updated : x)) } : b));
  };

  const setStatus = async (status: Question["status"]) => {
    const updated = await api.updateQuestion(q.id, { status });
    updateLocal(updated);
    // recompute batch counters from local state + this change
    setBatch((b) => b && recomputeCounts(b));
    setToast(status === "approved" ? `Question ${q.question_number ?? index + 1} approved ✓` : `Question ${q.question_number ?? index + 1} skipped`);
    if (index < batch.questions.length - 1) setIndex(index + 1);
    setEditing(false);
  };

  const bulkApprove = async () => {
    const approved = await api.bulkApproveHighConfidence(batch.id);
    const approvedIds = new Set(approved.map((a) => a.id));
    setBatch((b) =>
      b
        ? recomputeCounts({
            ...b,
            questions: b.questions.map((x) => (approvedIds.has(x.id) ? { ...x, status: "approved" } : x)),
          })
        : b,
    );
  };

  const deleteWholeBatch = async () => {
    await api.deleteImport(batch.id);
    navigate(`/module/${batch.module}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[var(--text)] text-[var(--bg)] text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}
      <Link to={`/module/${batch.module}`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
        ← {MODULE_LABELS[batch.module]}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Import Preview</h1>
        <div className="flex items-center gap-4 text-sm">
          <Counter label="Imported" value={batch.imported_count} />
          <Counter label="Needs Review" value={batch.needs_review_count} tone="warn" />
          <Counter label="Approved" value={batch.approved_count} tone="good" />
          <Counter label="Skipped" value={batch.skipped_count} />
          <button onClick={bulkApprove} className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] font-medium">
            Approve all high-confidence
          </button>
          {confirmDeleteBatch ? (
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">Delete this whole batch?</span>
              <button onClick={deleteWholeBatch} className="px-3 py-1.5 rounded-md bg-[var(--incorrect)] text-white font-medium">Confirm</button>
              <button onClick={() => setConfirmDeleteBatch(false)} className="px-3 py-1.5 rounded-md border border-[var(--border)] font-medium">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDeleteBatch(true)} className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[var(--incorrect)] hover:bg-[var(--incorrect-soft)] font-medium">
              Delete Batch
            </button>
          )}
        </div>
      </div>

      {otherApprovedBatches.length > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] text-sm">
          <p className="font-medium">This module already has {otherApprovedBatches.reduce((s, b) => s + b.approved_count, 0)} approved question(s) from {otherApprovedBatches.length === 1 ? "another import" : "other imports"}.</p>
          <p className="text-[var(--text-muted)] mt-1">
            If this batch is a re-upload of the same PDF, approving it too will create duplicate questions in your
            test pool. Either delete the old batch first, or Delete Batch here if this one is the mistake.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Question {q.question_number ?? index + 1}</h2>
            <div className="flex items-center gap-2">
              <ConfidenceBadge confidence={q.confidence} />
              <StatusBadge status={q.status} />
            </div>
          </div>

          <div className="mb-4">
            <QuestionVisual question={q} />
          </div>

          {editing ? (
            <EditForm question={q} onSaved={(u) => { updateLocal(u); setEditing(false); }} onCancel={() => setEditing(false)} />
          ) : (
            <ReviewSummary question={q} />
          )}

          {!editing && (
            // Sticky: on a tall multi-part question these controls could sit
            // far below the fold, making them easy to miss and, after they
            // auto-advance to the next (possibly shorter/taller) question,
            // easy to lose track of entirely (confirmed by real-world
            // testing). Pinning them to the viewport bottom keeps them
            // reachable regardless of question height or scroll position.
            <div className="sticky bottom-0 -mx-5 px-5 py-4 mt-6 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm flex items-center gap-2 rounded-b-xl">
              <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-md border border-[var(--border)] text-sm font-medium hover:bg-[var(--surface-2)]">
                Edit
              </button>
              <button onClick={() => setStatus("approved")} className="px-4 py-2 rounded-md bg-[var(--correct)] text-white text-sm font-medium">
                Approve
              </button>
              <button onClick={() => setStatus("skipped")} className="px-4 py-2 rounded-md border border-[var(--border)] text-sm font-medium hover:bg-[var(--surface-2)]">
                Skip
              </button>
              <div className="flex-1" />
              <button disabled={index === 0} onClick={() => setIndex((i) => i - 1)} className="px-3 py-2 rounded-md border border-[var(--border)] text-sm disabled:opacity-40">
                ← Previous
              </button>
              <button disabled={index === batch.questions.length - 1} onClick={() => setIndex((i) => i + 1)} className="px-3 py-2 rounded-md border border-[var(--border)] text-sm disabled:opacity-40">
                Next →
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 h-fit">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">All Questions</h3>
          <div className="grid grid-cols-6 lg:grid-cols-5 gap-1.5 max-h-[70vh] overflow-y-auto pr-1">
            {batch.questions.map((item, i) => {
              const tone =
                item.status === "approved" ? "bg-[var(--correct-soft)] text-[var(--correct)]"
                : item.status === "skipped" ? "bg-[var(--surface-2)] text-[var(--text-muted)] line-through"
                : item.confidence === "low" || item.confidence === "none" ? "bg-[var(--incorrect-soft)] text-[var(--incorrect)]"
                : "bg-[var(--warning-soft)] text-[var(--warning)]";
              return (
                <button
                  key={item.id}
                  onClick={() => { setIndex(i); setEditing(false); }}
                  className={`h-8 rounded text-xs font-semibold tabular-nums ${tone} ${i === index ? "ring-2 ring-[var(--accent)]" : ""}`}
                >
                  {item.question_number ?? i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function recomputeCounts(b: ImportBatchDetail): ImportBatchDetail {
  return {
    ...b,
    approved_count: b.questions.filter((q) => q.status === "approved").length,
    skipped_count: b.questions.filter((q) => q.status === "skipped").length,
    needs_review_count: b.questions.filter((q) => q.status === "needs_review").length,
  };
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" }) {
  const cls = tone === "good" ? "text-[var(--correct)]" : tone === "warn" ? "text-[var(--warning)]" : "text-[var(--text)]";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
      <span className="text-[var(--text-muted)]">{label}</span>
    </span>
  );
}

function ReviewSummary({ question }: { question: Question }) {
  if (question.parts?.length) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
            Multi-part question — {question.parts.length} parts
          </p>
          <MultiPartOptionGrid question={question} selectedByPart={{}} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {question.parts.map((p) => (
            <Field key={p.label} label={`${p.label} — Correct Answer`} value={p.correct_answer ?? "Not set"} highlight={!p.correct_answer} />
          ))}
          <Field label="Difficulty" value={question.difficulty ?? "Not set"} />
          <Field label="Topic" value={question.topic} />
        </div>
        <p className="text-xs text-[var(--warning)]">
          No answer key entry could be matched to this question's parts — set each part's correct answer manually in Edit if you know it.
        </p>
      </div>
    );
  }
  if (question.variables?.length) {
    const decoded = decodePartAnswers(question.correct_answer);
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
            Asks for {question.variables.length} value{question.variables.length === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            {question.variables.map((v) => (
              <span key={v}>
                <span className="font-semibold">{v} = </span>
                <span className={decoded[v] ? "text-[var(--correct)] font-medium" : "text-[var(--incorrect)]"}>{decoded[v] ?? "Not set"}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Field label="Difficulty" value={question.difficulty ?? "Not set"} />
          <Field label="Topic" value={question.topic} />
          <Field label="Source" value={question.source_pdf_filename ? `p.${question.source_page}` : "—"} />
        </div>
        {!Object.keys(decoded).length && (
          <p className="text-xs text-[var(--warning)]">
            No answer key entry could be matched to this question — set each value manually in Edit if you know it.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {question.option_type === "mcq" && question.options && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Options</p>
          <OptionGrid question={question} selected={null} />
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <Field label="Correct Answer" value={question.correct_answer ?? "Not set"} highlight={!question.correct_answer} />
        <Field label="Difficulty" value={question.difficulty ?? "Not set"} />
        <Field label="Topic" value={question.topic} />
        <Field label="Source" value={question.source_pdf_filename ? `p.${question.source_page}` : "—"} />
      </div>
      {question.detected_answer_raw && !question.correct_answer && (
        <p className="text-xs text-[var(--warning)]">
          Parser detected "{question.detected_answer_raw}" with low confidence — verify and set manually if correct.
        </p>
      )}
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className={`font-medium ${highlight ? "text-[var(--incorrect)]" : ""}`}>{value}</p>
    </div>
  );
}

function EditForm({ question, onSaved, onCancel }: { question: Question; onSaved: (q: Question) => void; onCancel: () => void }) {
  const [text, setText] = useState(question.question_text ?? "");
  const [correctAnswer, setCorrectAnswer] = useState(question.correct_answer ?? "");
  const [difficulty, setDifficulty] = useState(question.difficulty ?? "");
  const [topic, setTopic] = useState(question.topic);
  const [options, setOptions] = useState(question.options ?? []);
  const [parts, setParts] = useState(question.parts ?? []);
  const [varAnswers, setVarAnswers] = useState<Record<string, string>>(decodePartAnswers(question.correct_answer));
  const [saving, setSaving] = useState(false);
  const isMultiPart = !!question.parts?.length;
  const isMultiVariable = !isMultiPart && !!question.variables?.length;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateQuestion(question.id, {
        question_text: text,
        difficulty: difficulty || null,
        topic,
        ...(isMultiPart
          ? { parts }
          : isMultiVariable
            ? { correct_answer: encodePartAnswers(varAnswers) }
            : {
                correct_answer: correctAnswer || null,
                options: question.option_type === "mcq" ? options : undefined,
              }),
      });
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Question Text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm font-mono"
        />
      </div>

      {isMultiPart ? (
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
            Correct answer per part
          </label>
          <div className="space-y-2">
            {parts.map((part, pi) => (
              <div key={part.label} className="flex items-center gap-2">
                <span className="w-28 text-sm font-medium truncate">{part.label}</span>
                <select
                  value={part.correct_answer ?? ""}
                  onChange={(e) =>
                    setParts((ps) => ps.map((p, j) => (j === pi ? { ...p, correct_answer: e.target.value || null } : p)))
                  }
                  className="flex-1 px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sm"
                >
                  <option value="">Not set</option>
                  {part.options.map((o) => (
                    <option key={o.key} value={o.key}>{o.key}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : isMultiVariable ? (
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
            Correct value per variable
          </label>
          <div className="flex flex-wrap gap-3">
            {question.variables!.map((v) => (
              <div key={v} className="flex items-center gap-1.5">
                <span className="text-sm font-medium w-6 text-right">{v} =</span>
                <input
                  value={varAnswers[v] ?? ""}
                  onChange={(e) => setVarAnswers((va) => ({ ...va, [v]: e.target.value }))}
                  className="w-20 px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sm text-center"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {question.option_type === "mcq" && options.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Options (text label, if not image-based)</label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <span className="w-6 text-sm font-semibold">{opt.key}</span>
                    <input
                      value={opt.text ?? ""}
                      disabled={!!opt.image_path}
                      placeholder={opt.image_path ? "(image-based option)" : ""}
                      onChange={(e) => setOptions((os) => os.map((o, j) => (j === i ? { ...o, text: e.target.value } : o)))}
                      className="flex-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-sm disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Correct Answer</label>
            {question.option_type === "mcq" && options.length > 0 ? (
              <select value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} className="w-full max-w-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sm">
                <option value="">Not set</option>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>{o.key}</option>
                ))}
              </select>
            ) : (
              <input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} className="w-full max-w-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sm" />
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sm">
            <option value="">Not set</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Topic</label>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sm">
            {TOPIC_CHOICES[question.module].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
          Save Changes
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-md border border-[var(--border)] text-sm font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}
