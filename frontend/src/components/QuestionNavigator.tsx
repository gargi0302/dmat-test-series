export interface NavItemState {
  answered: boolean;
  markedForReview: boolean;
}

export function QuestionNavigator({
  count, currentIndex, states, onJump,
}: {
  count: number;
  currentIndex: number;
  states: NavItemState[];
  onJump: (index: number) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
        {Array.from({ length: count }, (_, i) => {
          const s = states[i];
          const isCurrent = i === currentIndex;
          let cls = "bg-[var(--surface-2)] text-[var(--text-muted)] border-transparent";
          if (s?.markedForReview) cls = "bg-[var(--marked-soft)] text-[var(--marked)] border-[var(--marked)]";
          else if (s?.answered) cls = "bg-[var(--correct-soft)] text-[var(--correct)] border-transparent";
          if (isCurrent) cls += " ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)]";
          return (
            <button
              key={i}
              onClick={() => onJump(i)}
              className={`h-8 w-full rounded-md border text-xs font-semibold tabular-nums transition-colors ${cls}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-[var(--text-muted)]">
        <LegendDot cls="bg-[var(--surface-2)]" label="Unanswered" />
        <LegendDot cls="bg-[var(--correct-soft)]" label="Answered" />
        <LegendDot cls="bg-[var(--marked-soft)]" label="Marked for review" />
        <LegendDot cls="ring-2 ring-[var(--accent)]" label="Current" />
      </div>
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${cls}`} />
      {label}
    </span>
  );
}
