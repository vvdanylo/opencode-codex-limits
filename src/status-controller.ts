import { createEffect, createSignal } from "solid-js";
import { displayMode, timeFormat, validDisplayMode, type DisplayMode, type DisplaySettings } from "./display.ts";
import type { UsageStatus } from "./status.tsx";

export type StatusControls = ReturnType<typeof createStatusController>;

export function createStatusController(input: {
  settings: () => DisplaySettings;
  save: (settings: DisplaySettings) => void | Promise<void>;
  modes: readonly DisplayMode[];
  active: () => boolean;
  subscribe: (refresh: () => void) => (() => void) | undefined;
}, load: () => Promise<UsageStatus>) {
  const [usage, setUsage] = createSignal<UsageStatus>();
  const [error, setError] = createSignal<string>();
  const [now, setNow] = createSignal(Date.now());
  let busy = false;
  let disposed = false;
  let pending = Promise.resolve();
  const getSettings = () => input.settings();
  const mode = () => {
    const value = displayMode(getSettings());
    return input.modes.includes(value) ? value : "panel";
  };
  const visible = () => mode() !== "hidden" && input.active();
  const refresh = async () => {
    if (disposed || busy || !visible()) return;
    busy = true;
    try {
      const result = await load();
      if (!disposed) { setUsage(result); setError(undefined); }
    } catch (cause) {
      if (!disposed) {
        setUsage(undefined);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally { busy = false; }
  };
  const ensureLoaded = () => {
    if (!usage() && !error() && !busy) void refresh();
  };
  const update = (change: (settings: DisplaySettings) => void) => {
    const operation = pending.then(async () => {
      if (disposed) return;
      const next = { ...getSettings() };
      change(next);
      await input.save(next);
    });
    pending = operation.catch(() => {});
    return operation;
  };
  let wasVisible = false;
  createEffect(() => {
    const isVisible = visible();
    if (isVisible && !wasVisible) void refresh();
    wasVisible = isVisible;
  });
  const timer = setInterval(() => { setNow(Date.now()); void refresh(); }, 60_000);
  timer.unref?.();
  const unsubscribe = input.subscribe(() => void refresh());
  return {
    usage, error, now, mode, visible, refresh, ensureLoaded, getSettings, modes: input.modes,
    setMode: async (value: DisplayMode) => {
      if (!validDisplayMode(value) || !input.modes.includes(value)) throw new Error(`Unsupported display mode: ${value}`);
      await update((next) => { next.displayMode = value; next.showPanel = value !== "hidden"; });
      if (value !== "hidden") void refresh();
    },
    toggleResets: async () => {
      await update((next) => { next.showResets = !next.showResets; });
      return getSettings().showResets;
    },
    toggleExpiry: async () => {
      await update((next) => { next.showResetExpiry = next.showResetExpiry === false; });
      return getSettings().showResetExpiry !== false;
    },
    toggleTimeFormat: async () => {
      await update((next) => { next.timeFormat = timeFormat(next) === "absolute" ? "countdown" : "absolute"; });
      return timeFormat(getSettings());
    },
    dispose: () => {
      disposed = true;
      clearInterval(timer);
      unsubscribe?.();
    },
  };
}
