/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js";
import { validDisplayMode, validTimeFormat, type DisplaySettings } from "./display.ts";
import { createStatusController } from "./status-controller.ts";
import { StatusView } from "./status-view.tsx";

export type UsageWindow = { label: string; remaining: string; remainingPercent?: number; reset: string; resetAt?: number };
export type UsageStatus = { windows: UsageWindow[]; resets?: number; resetExpiries?: number[] };

export function registerStatus(api: any, load: () => Promise<UsageStatus>, defaults: DisplaySettings, locale: "en" | "uk" = "en", accountEmail?: () => string | undefined) {
  const get = (key: string, fallback: any) => api.kv?.get?.(`codex-limits.${key}`, fallback) ?? fallback;
  const [settings, setSettings] = createSignal<DisplaySettings>({
    displayMode: validDisplayMode(get("displayMode", defaults.displayMode)),
    showPanel: get("showPanel", defaults.showPanel) === true,
    showResets: get("showResets", defaults.showResets) === true,
    showResetExpiry: get("showResetExpiry", defaults.showResetExpiry !== false) !== false,
    timeFormat: validTimeFormat(get("timeFormat", defaults.timeFormat)) ?? validTimeFormat(defaults.timeFormat) ?? "absolute",
  });
  const status = createStatusController({
    settings,
    save: (next) => {
      for (const [key, value] of Object.entries(next)) api.kv?.set?.(`codex-limits.${key}`, value);
      setSettings(next);
    },
    modes: ["panel", "compact-sidebar", "hidden"],
    active: () => true,
    subscribe: (refresh) => api.event?.on?.("session.updated", refresh),
  }, load);
  const colors = () => ({ text: api.theme?.current?.text, muted: api.theme?.current?.textMuted,
    error: api.theme?.current?.error, warning: api.theme?.current?.warning, success: api.theme?.current?.success });
  api.slots?.register?.({ slots: {
    sidebar_content: () => status.visible()
      ? <StatusView status={status} locale={locale} colors={colors} accountEmail={accountEmail} compact={status.mode() === "compact-sidebar"} /> : null,
  } });
  api.lifecycle?.onDispose?.(status.dispose);
  return { ...status, colors, togglePanel: async () => {
    const enabled = status.mode() === "hidden";
    await status.setMode(enabled ? "panel" : "hidden");
    return enabled;
  } };
}
