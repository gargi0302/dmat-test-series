import { useEffect, useState } from "react";

/** Re-renders the calling component roughly once a second. Never used to
 * accumulate time itself — every displayed duration is always recomputed
 * from real timestamps (Date.now() minus a stored epoch, or an
 * end-timestamp minus Date.now()) so background-tab drift can't build up. */
export function useTick(intervalMs = 1000): number {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return Date.now();
}

export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatShortSeconds(totalSeconds: number): string {
  return `${Math.round(totalSeconds)}s`;
}
