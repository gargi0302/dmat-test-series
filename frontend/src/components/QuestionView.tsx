import type { Option, Question } from "@/types";
import { decodePartAnswers, encodePartAnswers } from "@/lib/multiPart";

/** Renders a question the way the source integrity rule requires: the PDF
 * crop is always the primary, authoritative visual — never redrawn or
 * reconstructed. Extracted text is only ever a secondary caption. */
export function QuestionVisual({ question }: { question: Question }) {
  if (!question.question_image_path) {
    return <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{question.question_text}</p>;
  }
  return (
    <img
      src={question.question_image_path}
      alt={`Question ${question.question_number ?? ""}`}
      className="pdf-crop rounded-md border border-[var(--border)] bg-white"
    />
  );
}

function orderOptions(options: Option[], order?: string[] | null): Option[] {
  if (!order || order.length === 0) return options;
  const byKey = new Map(options.map((o) => [o.key, o]));
  const ordered = order.map((k) => byKey.get(k)).filter((o): o is Option => !!o);
  for (const o of options) if (!order.includes(o.key)) ordered.push(o);
  return ordered;
}

/** One set of clickable/reviewable options — shared by an ordinary
 * single-answer question and by each part of a multi-part question.
 * Image-based options render as a card (image on top, label below);
 * text-based options render as a single labeled row. */
function OptionButtons({
  options, selected, onSelect, correctAnswer, revealCorrectness,
}: {
  options: Option[];
  selected: string | null;
  onSelect?: (key: string) => void;
  correctAnswer?: string | null;
  revealCorrectness?: boolean;
}) {
  const interactive = !!onSelect;
  const allImages = options.every((o) => o.image_path);

  return (
    <div className={`grid gap-3 ${allImages ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
      {options.map((opt) => {
        const isSelected = selected === opt.key;
        const isCorrect = revealCorrectness && correctAnswer === opt.key;
        const isWrongPick = revealCorrectness && isSelected && correctAnswer !== null && correctAnswer !== opt.key;

        let cls = "border-[var(--border)] hover:border-[var(--accent)] hover:shadow-md hover:-translate-y-0.5";
        if (isSelected && !revealCorrectness) cls = "border-[var(--accent)] bg-[var(--accent-soft)] ring-2 ring-[var(--accent)] shadow-sm";
        if (revealCorrectness) {
          if (isCorrect) cls = "border-[var(--correct)] bg-[var(--correct-soft)] ring-2 ring-[var(--correct)]";
          else if (isWrongPick) cls = "border-[var(--incorrect)] bg-[var(--incorrect-soft)] ring-2 ring-[var(--incorrect)]";
          else cls = "border-[var(--border)] opacity-60";
        }

        if (opt.image_path) {
          return (
            <button
              key={opt.key}
              type="button"
              disabled={!interactive}
              onClick={() => onSelect?.(opt.key)}
              className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 bg-[var(--surface)] transition-all duration-150 ${cls} ${interactive ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className="flex items-center justify-center w-full rounded-lg overflow-hidden bg-white">
                <img src={opt.image_path} alt={`Option ${opt.key}`} className="pdf-crop" />
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {opt.key}
                {revealCorrectness && isCorrect && <span className="text-[var(--correct)]">✓</span>}
                {revealCorrectness && isWrongPick && <span className="text-[var(--incorrect)]">✗</span>}
              </span>
              {isSelected && !revealCorrectness && (
                <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center font-bold">✓</span>
              )}
            </button>
          );
        }

        return (
          <button
            key={opt.key}
            type="button"
            disabled={!interactive}
            onClick={() => onSelect?.(opt.key)}
            className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all duration-150 ${cls} ${interactive ? "cursor-pointer" : "cursor-default"}`}
          >
            <span className="flex-shrink-0 h-7 w-7 rounded-full border border-current/30 flex items-center justify-center text-sm font-semibold">
              {opt.key}
            </span>
            <span className="flex-1 min-w-0 text-sm">{opt.text}</span>
            {revealCorrectness && isCorrect && <span className="text-[var(--correct)] font-bold">✓</span>}
            {revealCorrectness && isWrongPick && <span className="text-[var(--incorrect)] font-bold">✗</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Renders the answer panel for an ordinary single-answer question — MCQ
 * options, or a free-text/numeric input. Multi-part questions (with a
 * `parts` array) use MultiPartOptionGrid instead; see ExamRunner etc. */
export function OptionGrid({
  question, selected, onSelect, optionOrder, correctAnswer, revealCorrectness,
}: {
  question: Question;
  selected: string | null;
  onSelect?: (key: string) => void;
  optionOrder?: string[] | null;
  correctAnswer?: string | null;
  revealCorrectness?: boolean;
}) {
  if (question.option_type !== "mcq" || !question.options?.length) {
    if (question.variables?.length) {
      return (
        <MultiVariableInput
          variables={question.variables}
          value={selected}
          onChange={onSelect}
          correctAnswer={correctAnswer}
          revealCorrectness={revealCorrectness}
        />
      );
    }
    return (
      <FreeResponseInput
        value={selected}
        onChange={onSelect}
        numeric={question.option_type === "numeric"}
        correctAnswer={correctAnswer}
        revealCorrectness={revealCorrectness}
        // Latin Square questions always ask for exactly one letter/number/
        // symbol, for the single cell the source PDF marks with "?" — label
        // the input to match instead of a generic, disconnected text box.
        label={question.module === "latin_squares" ? "?" : undefined}
      />
    );
  }

  return (
    <OptionButtons
      options={orderOptions(question.options, optionOrder)}
      selected={selected}
      onSelect={onSelect}
      correctAnswer={correctAnswer}
      revealCorrectness={revealCorrectness}
    />
  );
}

const PART_ACCENTS = ["var(--accent)", "#e0417a", "#16813d", "#b7791f"];

/** Renders every part of a multi-part question (e.g. "Matrix 5" + "Matrix
 * 6"), each as its own clearly separated, labeled, independently clickable
 * options group — echoing how the source PDF itself visually distinguishes
 * each part with its own colored heading bar. */
export function MultiPartOptionGrid({
  question, selectedByPart, onSelectPart, revealCorrectness,
}: {
  question: Question;
  selectedByPart: Record<string, string>;
  onSelectPart?: (label: string, key: string) => void;
  revealCorrectness?: boolean;
}) {
  if (!question.parts?.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {question.parts.map((part, i) => {
        const accent = PART_ACCENTS[i % PART_ACCENTS.length];
        const picked = selectedByPart[part.label];
        return (
          <div key={part.label} className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--surface-2)]">
            <div className="h-1.5" style={{ background: accent }} />
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">{part.label}</p>
                {picked && !revealCorrectness && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: accent, background: "color-mix(in srgb, " + accent + " 15%, transparent)" }}>
                    {picked} selected
                  </span>
                )}
              </div>
              <OptionButtons
                options={part.options}
                selected={picked ?? null}
                onSelect={onSelectPart ? (key) => onSelectPart(part.label, key) : undefined}
                correctAnswer={part.correct_answer}
                revealCorrectness={revealCorrectness}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One labeled input per variable a fill-in question asks for (e.g.
 * "A = ? • B = ? • C = ? • D = ?" → four boxes, not one generic text field) —
 * the exact letters are whatever the source PDF used, never invented. */
function MultiVariableInput({
  variables, value, onChange, correctAnswer, revealCorrectness,
}: {
  variables: string[];
  value: string | null;
  onChange?: (v: string) => void;
  correctAnswer?: string | null;
  revealCorrectness?: boolean;
}) {
  const decoded = decodePartAnswers(value);
  const correctDecoded = decodePartAnswers(correctAnswer);
  const interactive = !!onChange;

  const setVar = (v: string, val: string) => {
    onChange?.(encodePartAnswers({ ...decoded, [v]: val }) ?? "");
  };

  return (
    <div className="flex flex-wrap gap-3">
      {variables.map((v) => {
        const known = revealCorrectness && correctDecoded[v];
        return (
          <div key={v} className="flex items-center gap-1.5">
            <span className="text-sm font-semibold w-5 text-right">{v} =</span>
            <input
              type="text"
              inputMode="numeric"
              disabled={!interactive}
              value={decoded[v] ?? ""}
              onChange={(e) => setVar(v, e.target.value)}
              className="w-16 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-80"
            />
            {known && <span className="text-xs text-[var(--correct)] font-medium">({correctDecoded[v]})</span>}
          </div>
        );
      })}
    </div>
  );
}

function FreeResponseInput({
  value, onChange, numeric, correctAnswer, revealCorrectness, label,
}: {
  value: string | null;
  onChange?: (v: string) => void;
  numeric?: boolean;
  correctAnswer?: string | null;
  revealCorrectness?: boolean;
  /** Ties the input to a specific marker in the source image (e.g. "?" for
   * a Latin Square's single highlighted cell) instead of a generic,
   * disconnected text box. */
  label?: string;
}) {
  const interactive = !!onChange;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {label && (
          <span className="flex-shrink-0 h-9 w-9 rounded-md bg-[var(--incorrect-soft)] text-[var(--incorrect)] flex items-center justify-center text-base font-bold">
            {label}
          </span>
        )}
        <input
          type={numeric ? "text" : "text"}
          inputMode={numeric ? "numeric" : "text"}
          disabled={!interactive}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={label ? `Answer for ${label}` : numeric ? "Enter numeric answer" : "Enter your answer"}
          className="w-full max-w-xs px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-80"
        />
      </div>
      {revealCorrectness && (
        <p className="text-sm">
          <span className="text-[var(--text-muted)]">Correct answer: </span>
          <span className="font-semibold text-[var(--correct)]">{correctAnswer ?? "—"}</span>
        </p>
      )}
    </div>
  );
}
