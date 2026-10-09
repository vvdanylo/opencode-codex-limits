/** @jsxImportSource @opentui/solid */
import { validDisplayMode, validTimeFormat, type DisplaySettings } from "./display.ts";
import { createStatusController } from "./status-controller.ts";
import { StatusView } from "./status-view.tsx";
import type { UsageStatus } from "./status.tsx";
import { getAuthEmail } from "./tui-v1.ts";

export function registerStatusV2(context: any, load: () => Promise<UsageStatus>, locale: "en" | "uk" = "en", onReconnect?: () => void) {
  const [settings, updateSettings] = context.storage.store("codex-limits.display", {
    initial: {
      displayMode: validDisplayMode(context.options?.displayMode),
      showPanel: context.options?.showPanel !== false,
      showResets: context.options?.showResets === true,
      showResetExpiry: context.options?.showResetExpiry !== false,
      timeFormat: validTimeFormat(context.options?.timeFormat) ?? "absolute",
    },
  });
  const status = createStatusController({
    settings: () => ({ ...settings, showResetExpiry: settings.showResetExpiry ?? (context.options?.showResetExpiry !== false),
      timeFormat: validTimeFormat(settings.timeFormat) ?? validTimeFormat(context.options?.timeFormat) ?? "absolute" }),
    save: (next) => updateSettings((draft: DisplaySettings) => { Object.assign(draft, next); }),
    modes: ["panel", "compact-sidebar", "compact-footer", "hidden"],
    active: () => context.ui.model.current()?.providerID === "openai",
    subscribe: (refresh) => {
      const stopSession = context.data.on("session.updated", refresh);
      const stopProvider = context.data.on("provider.updated", refresh);
      return () => { stopSession?.(); stopProvider?.(); };
    },
  }, load);
  const colors = () => ({ text: context.theme.text.base, muted: context.theme.text.base,
    error: "#f44336", warning: "#ffb300", success: "#00c853" });
  const removeSidebar = context.ui.slot({
    append: "sidebar.content",
    render: () => status.visible() && status.mode() !== "compact-footer"
      ? <StatusView status={status} locale={locale} colors={colors} accountEmail={getAuthEmail} onReconnect={onReconnect} compact={status.mode() === "compact-sidebar"} /> : null,
  });
  const removeFooter = context.ui.slot({
    append: "prompt.footer",
    render: () => status.visible() && status.mode() === "compact-footer"
      ? <StatusView status={status} locale={locale} colors={colors} accountEmail={getAuthEmail} onReconnect={onReconnect} compact /> : null,
  });
  return { ...status, colors, dispose: () => {
    status.dispose();
    if (typeof removeSidebar === "function") removeSidebar();
    if (typeof removeFooter === "function") removeFooter();
  } };
}
