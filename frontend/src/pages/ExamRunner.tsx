import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { TestDetail } from "@/types";
import { MODULE_LABELS } from "@/types";
import { CountdownTimer, QuestionElapsed } from "@/components/Timer";
import { QuestionNavigator, type NavItemState } from "@/components/QuestionNavigator";
import { QuestionVisual, OptionGrid, MultiPartOptionGrid } from "@/components/QuestionView";
import { decodePartAnswers, encodePartAnswers } from "@/lib/multiPart";

export default function ExamRunner() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();

  const [test, setTest] = useState<TestDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [accumulated, setAccumulated] = useState<Record<string, number>>({});
  const [activeSince, setActiveSince] = useState<number | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submittedRef = useRef(false);

  // ---- initial load ----
  useEffect(() => {
    if (!testId) return;
    api.getTest(testId).then((t) => {
      if (t.status !== "in_progress") {
        navigate(`/tests/${t.id}/results`, { replace: true });
        return;
      }
      setTest(t);
      const a: Record<string, string | null> = {};
      const m: Record<string, boolean> = {};
      const acc: Record<string, number> = {};
      t.attempts.forEach((att) => {
        a[att.question_id] = att.selected_answer;
        m[att.question_id] = att.marked_for_review;
        acc[att.question_id] = att.time_spent_seconds;
      });
      setAnswers(a);
      setMarked(m);
      setAccumulated(acc);
      const firstUnanswered = t.questions.findIndex((q) => !a[q.id]);
      const startIndex = firstUnanswered === -1 ? 0 : firstUnanswered;
      setIndex(startIndex);
      const startQ = t.questions[startIndex];
      const now = Date.now();
      setActiveSince(now);
      api.patchAttempt(t.id, startQ.id, { mark_active: true }).catch(() => {});
    }).catch((e) => setError(e.message));
  }, [testId, navigate]);

  const currentQuestion = test?.questions[index] ?? null;

  // ---- flush elapsed time for whichever question is currently active ----
  const flush = useCallback((questionId: string, sinceOverride?: number | null) => {
    const since = sinceOverride !== undefined ? sinceOverride : activeSince;
    if (!since || !test) return 0;
    const elapsed = (Date.now() - since) / 1000;
    if (elapsed <= 0) return 0;
    setAccumulated((acc) => ({ ...acc, [questionId]: (acc[questionId] ?? 0) + elapsed }));
    api.patchAttempt(test.id, questionId, { elapsed_seconds: elapsed }).catch(() => {});
    return elapsed;
  }, [activeSince, test]);

  // ---- heartbeat autosave every 5s while a question is active & tab visible ----
  useEffect(() => {
    if (!test || !currentQuestion) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!activeSince) return;
      flush(currentQuestion.id);
      setActiveSince(Date.now());
    }, 5000);
    return () => window.clearInterval(id);
  }, [test, currentQuestion, activeSince, flush]);

  // ---- pause timing while the tab is hidden; resume on return ----
  useEffect(() => {
    if (!test || !currentQuestion) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        flush(currentQuestion.id);
        setActiveSince(null);
      } else {
        setActiveSince(Date.now());
        api.patchAttempt(test.id, currentQuestion.id, { mark_active: true }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test, currentQuestion?.id]);

  const goTo = (newIndex: number) => {
    if (!test || !currentQuestion || newIndex === index || newIndex < 0 || newIndex >= test.questions.length) return;
    flush(currentQuestion.id);
    const nextQ = test.questions[newIndex];
    setIndex(newIndex);
    setActiveSince(Date.now());
    api.patchAttempt(test.id, nextQ.id, { mark_active: true }).catch(() => {});
  };

  const selectAnswer = (key: string) => {
    if (!test || !currentQuestion) return;
    setAnswers((a) => ({ ...a, [currentQuestion.id]: key }));
    api.patchAttempt(test.id, currentQuestion.id, { selected_answer: key }).catch(() => {});
  };

  const selectPartAnswer = (partLabel: string, key: string) => {
    if (!test || !currentQuestion) return;
    const current = decodePartAnswers(answers[currentQuestion.id]);
    const encoded = encodePartAnswers({ ...current, [partLabel]: key });
    setAnswers((a) => ({ ...a, [currentQuestion.id]: encoded }));
    api.patchAttempt(test.id, currentQuestion.id, { selected_answer: encoded }).catch(() => {});
  };

  const toggleMarked = () => {
    if (!test || !currentQuestion) return;
    const next = !marked[currentQuestion.id];
    setMarked((m) => ({ ...m, [currentQuestion.id]: next }));
    api.patchAttempt(test.id, currentQuestion.id, { marked_for_review: next }).catch(() => {});
  };

  const doSubmit = useCallback(async () => {
    if (!test || !currentQuestion || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const since = activeSince;
    const elapsed = since ? (Date.now() - since) / 1000 : 0;
    try {
      await api.submitTest(test.id, { final_elapsed_seconds: elapsed, final_question_id: currentQuestion.id });
      navigate(`/tests/${test.id}/results`);
    } catch (e) {
      setError((e as Error).message);
      submittedRef.current = false;
      setSubmitting(false);
    }
  }, [test, currentQuestion, activeSince, navigate]);

  // ---- keyboard shortcuts (ignored while typing into an input) ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (!currentQuestion || !test) return;
      if (e.key === "ArrowLeft") goTo(index - 1);
      else if (e.key === "ArrowRight") goTo(index + 1);
      else if (currentQuestion.option_type === "mcq" && currentQuestion.options && !currentQuestion.parts) {
        const upper = e.key.toUpperCase();
        const opt = currentQuestion.options.find((o) => o.key.toUpperCase() === upper);
        if (opt) selectAnswer(opt.key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const navStates: NavItemState[] = useMemo(
    () => (test ? test.questions.map((q) => ({ answered: !!answers[q.id], markedForReview: !!marked[q.id] })) : []),
    [test, answers, marked],
  );

  const answeredCount = test ? test.questions.filter((q) => !!answers[q.id]).length : 0;
  const markedCount = test ? test.questions.filter((q) => !!marked[q.id]).length : 0;

  if (error) return <div className="max-w-2xl mx-auto px-6 py-10 text-[var(--incorrect)]">{error}</div>;
  if (!test || !currentQuestion) return <div className="max-w-2xl mx-auto px-6 py-10 text-[var(--text-muted)]">Loading test…</div>;

  const timerMinutes = (test.settings_snapshot?.timer_minutes as number | null) ?? null;
  const optionOrder = (test.settings_snapshot?.option_order as Record<string, string[]> | undefined)?.[currentQuestion.id] ?? null;

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--text)] flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)]">{MODULE_LABELS[test.module]} · {test.mode}</p>
            <p className="font-semibold">Question {index + 1} / {test.questions.length}</p>
          </div>
          {timerMinutes && test.end_timestamp ? (
            <CountdownTimer endTimestamp={test.end_timestamp} onExpire={doSubmit} />
          ) : (
            <QuestionElapsed activeSince={activeSince} accumulatedSeconds={accumulated[currentQuestion.id] ?? 0} />
          )}
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between mb-4">
              {timerMinutes && test.end_timestamp && (
                <QuestionElapsed activeSince={activeSince} accumulatedSeconds={accumulated[currentQuestion.id] ?? 0} />
              )}
              {marked[currentQuestion.id] && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--marked-soft)] text-[var(--marked)]">Marked for review</span>
              )}
            </div>
            <div className="mb-5">
              <QuestionVisual question={currentQuestion} />
            </div>
            {currentQuestion.parts?.length ? (
              <MultiPartOptionGrid
                question={currentQuestion}
                selectedByPart={decodePartAnswers(answers[currentQuestion.id])}
                onSelectPart={selectPartAnswer}
              />
            ) : (
              <OptionGrid
                question={currentQuestion}
                selected={answers[currentQuestion.id] ?? null}
                onSelect={selectAnswer}
                optionOrder={optionOrder}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              className="px-4 py-2 rounded-md border border-[var(--border)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--surface-2)]"
            >
              Previous
            </button>
            <button
              onClick={toggleMarked}
              className={`px-4 py-2 rounded-md border text-sm font-medium ${marked[currentQuestion.id] ? "border-[var(--marked)] text-[var(--marked)] bg-[var(--marked-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]"}`}
            >
              {marked[currentQuestion.id] ? "Unmark Review" : "Mark for Review"}
            </button>
            <button
              disabled={index === test.questions.length - 1}
              onClick={() => goTo(index + 1)}
              className="px-4 py-2 rounded-md border border-[var(--border)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--surface-2)]"
            >
              Next
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="px-5 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-semibold"
            >
              Submit Test
            </button>
          </div>
        </div>

        <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 h-fit lg:sticky lg:top-20">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Question Navigator</h3>
          <QuestionNavigator count={test.questions.length} currentIndex={index} states={navStates} onJump={goTo} />
        </aside>
      </div>

      {showSubmitConfirm && (
        <SubmitConfirmModal
          answered={answeredCount}
          total={test.questions.length}
          marked={markedCount}
          submitting={submitting}
          onCancel={() => setShowSubmitConfirm(false)}
          onConfirm={doSubmit}
        />
      )}
    </div>
  );
}

function SubmitConfirmModal({
  answered, total, marked, submitting, onCancel, onConfirm,
}: { answered: number; total: number; marked: number; submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  const unanswered = total - answered;
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-[var(--surface)] border border-[var(--border)] p-6">
        <h2 className="font-semibold text-lg mb-3">Submit Test?</h2>
        <p className="text-sm mb-1">You have answered {answered}/{total} questions.</p>
        {unanswered > 0 && <p className="text-sm text-[var(--warning)] mb-1">{unanswered} question{unanswered === 1 ? "" : "s"} unanswered.</p>}
        {marked > 0 && <p className="text-sm text-[var(--marked)] mb-1">{marked} question{marked === 1 ? "" : "s"} marked for review.</p>}
        <div className="flex items-center gap-2 mt-5">
          <button onClick={onConfirm} disabled={submitting} className="flex-1 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit Test"}
          </button>
          <button onClick={onCancel} disabled={submitting} className="flex-1 py-2 rounded-md border border-[var(--border)] text-sm font-medium">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
