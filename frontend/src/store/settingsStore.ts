import { create } from "zustand";
import { api } from "@/api/client";
import type { Settings } from "@/types";

const DEFAULT_SETTINGS: Settings = {
  default_question_count: 20,
  default_timer_minutes: 25,
  slow_threshold_seconds: 75,
  dark_mode: "system",
  randomize_questions: false,
  randomize_options: false,
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

function applyTheme(mode: Settings["dark_mode"]) {
  const root = document.documentElement;
  if (mode === "dark") root.setAttribute("data-theme", "dark");
  else if (mode === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    try {
      const settings = await api.getSettings();
      set({ settings, loaded: true });
      applyTheme(settings.dark_mode);
    } catch {
      set({ loaded: true });
    }
  },
  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    applyTheme(next.dark_mode);
    await api.updateSettings(patch);
  },
}));
