import { useTick, formatMMSS } from "@/lib/time";

/** Countdown computed from a fixed end timestamp, never a decrementing
 * counter — accurate even after the tab was backgrounded for a while. */
export function CountdownTimer({ endTimestamp, onExpire }: { endTimestamp: number; onExpire?: () => void }) {
  const now = useTick(1000);
  const remainingSeconds = (endTimestamp - now) / 1000;

  if (remainingSeconds <= 0) {
    if (onExpire) onExpire();
    return <TimerChip label="TIME LEFT" value="00:00" urgent />;
  }
  return (
    <TimerChip
      label="TIME LEFT"
      value={formatMMSS(remainingSeconds)}
      urgent={remainingSeconds < 60}
      warn={remainingSeconds < 300}
    />
  );
}

/** Elapsed-time display for the current question, computed from a fixed
 * start timestamp plus already-accumulated seconds — resuming a question
 * continues accumulating rather than resetting. */
export function QuestionElapsed({ activeSince, accumulatedSeconds }: { activeSince: number | null; accumulatedSeconds: number }) {
  const now = useTick(1000);
  const live = activeSince ? (now - activeSince) / 1000 : 0;
  return (
    <span className="tabular-nums text-[var(--text-muted)] text-xs">
      Question time: {formatMMSS(accumulatedSeconds + live)}
    </span>
  );
}

function TimerChip({ label, value, urgent, warn }: { label: string; value: string; urgent?: boolean; warn?: boolean }) {
  const cls = urgent
    ? "bg-[var(--incorrect-soft)] text-[var(--incorrect)]"
    : warn
      ? "bg-[var(--warning-soft)] text-[var(--warning)]"
      : "bg-[var(--surface-2)] text-[var(--text)]";
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-mono font-semibold text-sm tabular-nums ${cls}`}>
      <span className="text-[10px] font-sans font-bold tracking-wide opacity-70">{label}</span>
      {value}
    </div>
  );
}
