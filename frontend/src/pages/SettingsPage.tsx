import { useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import type { Settings } from "@/types";

export default function SettingsPage() {
  const { settings, loaded, load, update } = useSettingsStore();
  const [local, setLocal] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => setLocal(settings), [settings]);

  const save = async () => {
    await update(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5">
        <NumberField
          label="Default test length"
          hint="Number of questions in a Full Test."
          value={local.default_question_count}
          onChange={(v) => setLocal({ ...local, default_question_count: v })}
        />
        <NumberField
          label="Default timer (minutes)"
          hint="Total countdown for a Full Test."
          value={local.default_timer_minutes}
          onChange={(v) => setLocal({ ...local, default_timer_minutes: v })}
        />
        <NumberField
          label="Slow question threshold (seconds)"
          hint="Questions taking longer than this are flagged 'Correct but Slow' in analysis."
          value={local.slow_threshold_seconds}
          onChange={(v) => setLocal({ ...local, slow_threshold_seconds: v })}
        />

        <div>
          <label className="block text-sm font-medium mb-1">Theme</label>
          <select
            value={local.dark_mode}
            onChange={(e) => setLocal({ ...local, dark_mode: e.target.value as Settings["dark_mode"] })}
            className="w-full px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <ToggleField
          label="Randomize question order"
          checked={local.randomize_questions}
          onChange={(v) => setLocal({ ...local, randomize_questions: v })}
        />
        <ToggleField
          label="Randomize option order"
          checked={local.randomize_options}
          onChange={(v) => setLocal({ ...local, randomize_options: v })}
        />

        <button onClick={save} className="w-full py-2.5 rounded-md bg-[var(--accent)] text-white font-semibold text-sm">
          {saved ? "Saved ✓" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function NumberField({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <p className="text-xs text-[var(--text-muted)] mb-2">{hint}</p>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm"
      />
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-sm cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
    </label>
  );
}
