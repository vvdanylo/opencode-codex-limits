import { registerStatusV2 } from "./status-v2.tsx";
import { randomUUID } from "node:crypto";
import { availableResetExpiries, displayText } from "./display.ts";
import { codexRpc } from "./connection-rpc.ts";
import { usageStatus } from "./usage-status.ts";
import { openSettings } from "./settings-menu.tsx";
import legacy, {
  formatExpiry,
  getLocale,
  messages,
  type Locale,
  type ResetCredit,
} from "./tui-v1.ts";

type UsageWindow = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_at?: number;
};

function usageReport(data: any, locale: Locale): string {
  const text = messages[locale];
  if (!data.rate_limit) throw new Error(text.missingRateLimit);
  const windows: UsageWindow[] = [data.rate_limit.primary_window, data.rate_limit.secondary_window].filter(
    (window): window is UsageWindow => Boolean(window) && (!window.limit_window_seconds || window.limit_window_seconds < 28 * 86400),
  );
  if (!windows.length) throw new Error(text.missingWindows);

  const label = (seconds?: number) => {
    if (seconds === 18000) return text.fiveHourWindow;
    if (seconds === 604800) return text.weeklyWindow;
    if (!seconds) return "Limit";
    const hours = seconds / 3600;
    return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  };
  const resetTime = (timestamp?: number) => timestamp
    ? new Date(timestamp * 1000).toLocaleString(locale === "uk" ? "uk-UA" : "en-US", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : text.unknownReset;

  const lines = windows.map((window) => [
    `${label(window.limit_window_seconds)}: ${typeof window.used_percent === "number"
      ? `${Math.max(0, Math.min(100, Math.round(100 - window.used_percent)))}%`
      : "?"} ${text.remaining}`,
    `${locale === "uk" ? "Оновиться" : "Resets"}: ${resetTime(window.reset_at)}`,
  ].join("\n"));
  const count = data.rate_limit_reset_credits?.available_count;
  if (typeof count === "number") lines.push(text.availableResets(count));
  return lines.join("\n\n");
}

const v2 = {
  id: "local.codex-limits.cli",
  setup(context) {
    const locale = getLocale();
    const text = messages[locale];
    const toast = context.ui.toast.show;
    const rpc = context.client.rpc(codexRpc) as any;
    const [accountSettings, updateAccountSettings] = context.storage.store("codex-limits.accounts", {
      initial: { showEmail: true },
    });
    // The native picker displays saved credential labels. Restore only labels
    // created by this plugin, and leave user-supplied names untouched.
    const syncAccountLabels = async () => {
      const { accounts } = await rpc.accounts({}) as { accounts: Array<{ id: string; label: string; email: string }> };
      for (const account of accounts) {
        const decorated = account.label.match(/^(.+@.+) \((OAuth|OpenAI(?: \d+)?)\)$/);
        const base = /^(?:OAuth|OpenAI(?: \d+)?)$/.test(account.label)
          ? account.label : decorated?.[1] === account.email ? decorated[2] : undefined;
        if (!base) continue;
        const label = accountSettings.showEmail ? `${account.email} (${base})` : base;
        if (label !== account.label) await context.client.credential.update({ credentialID: account.id, label });
      }
    };
    let labelQueue = Promise.resolve();
    const queueAccountLabels = () => {
      const next = labelQueue.then(syncAccountLabels);
      labelQueue = next.catch(() => {});
      return next;
    };
    void queueAccountLabels().catch((error) => console.error("[codex-limits] Could not label OpenAI accounts", error));
    const loadIdentity = () => rpc.identity({});
    const loadUsage = () => rpc.usage({});
    const loadResetCredits = () => rpc.credits({});
    const loadCurrentStatus = async () => {
      await loadIdentity();
      const result = usageStatus(await loadUsage(), locale);
      try {
        const credits = await loadResetCredits();
        result.resets = credits.available_count;
        result.resetExpiries = availableResetExpiries(credits.credits);
      } catch (error) {
        console.error("[codex-limits] Could not load reset expiration", error);
      }
      return result;
    };
    let pendingRedemption: { creditId: string; requestId: string } | undefined;
    const consumeCredit = async (creditId: string) => {
      const requestId = pendingRedemption?.creditId === creditId ? pendingRedemption.requestId : randomUUID();
      pendingRedemption = { creditId, requestId };
      const { code } = await rpc.consume({ creditId, requestId });
      if (["reset", "nothing_to_reset", "no_credit", "already_redeemed"].includes(code)) pendingRedemption = undefined;
      switch (code) {
        case "reset": return { message: text.resetSucceeded, variant: "success" as const };
        case "nothing_to_reset": return { message: text.resetNotNeeded, variant: "info" as const };
        case "no_credit": return { message: text.resetUnavailable, variant: "info" as const };
        case "already_redeemed": return { message: text.resetAlreadyUsed, variant: "success" as const };
        default: throw new Error(text.invalidResetResponse);
      }
    };
    const reconnect = () => {
      const connect = context.keymap.commands().find((command: any) =>
        command.slash?.name === "connect" || command.id === "provider.connect" || /^connect provider$/i.test(command.title ?? ""));
      if (!connect) {
        toast({ message: "Open the Connect provider dialog in OpenCode to reconnect OpenAI.", variant: "warning" });
        return;
      }
      if (connect.id) context.keymap.dispatch(connect.id);
      else void connect.run();
    };
    const status = registerStatusV2(context, loadCurrentStatus, locale, reconnect);
    const labels = displayText[locale];
    const showError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[codex-limits]", error);
      toast({ message: text.error(message), variant: "error", duration: 10000 });
    };

    const availableCredits = (credits: ResetCredit[]) =>
      credits.filter((credit) => credit.status === "available" && credit.reset_type === "codex_rate_limits");

    context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "codex-account-emails",
          title: "Toggle emails in connected OpenAI accounts",
          group: "Codex",
          palette: true,
          slash: { name: "codex-account-emails" },
          run: async () => {
            try {
              await updateAccountSettings((draft: { showEmail: boolean }) => { draft.showEmail = !draft.showEmail; });
              await queueAccountLabels();
              toast({ message: accountSettings.showEmail ? "Account emails shown" : "Account emails hidden", variant: "info" });
            } catch (error) { showError(error); }
          },
        },
        {
          id: "codex-reconnect",
          title: "Reconnect OpenAI provider",
          group: "Codex",
          palette: true,
          slash: { name: "codex-reconnect" },
          run: reconnect,
        },
        {
          id: "codex-settings",
          title: labels.settings,
          group: "Codex",
          palette: true,
          slash: { name: "codex-settings" },
          run: () => openSettings(status, locale, context.ui.dialog, status.colors, showError),
        },
        {
          id: "codex-limits",
          title: text.commandTitle,
          description: text.commandDescription,
          group: "Codex",
          palette: true,
          slash: { name: "codex-limits" },
          run: async () => {
            try {
              toast({ message: text.loading, variant: "info", duration: 30000 });
              const data = await loadUsage();
              void status.refresh();
              toast({ title: text.usageTitle, message: usageReport(data, locale), variant: "success", duration: 12000 });
            } catch (error) { showError(error); }
          },
        },
        {
          id: "codex-resets",
          title: text.resetsCommandTitle,
          description: text.resetsCommandDescription,
          group: "Codex",
          palette: true,
          slash: { name: "codex-resets" },
          run: async () => {
            try {
              toast({ message: text.loadingResets, variant: "info", duration: 30000 });
              const data = await loadResetCredits();
              const credits = availableCredits(data.credits);
              await context.ui.dialog.alert({
                title: text.resetsCommandTitle,
                message: credits.length
                  ? [text.availableResets(data.available_count), ...credits.map((credit) =>
                      `${credit.title || "Full reset"}\n${locale === "uk" ? "Діє до" : "Expires"}: ${formatExpiry(credit.expires_at, locale)}`)].join("\n\n")
                  : text.noResets,
              });
            } catch (error) { showError(error); }
          },
        },
        {
          id: "codex-reset",
          title: text.resetCommandTitle,
          description: text.resetCommandDescription,
          group: "Codex",
          palette: true,
          slash: { name: "codex-reset" },
          run: async () => {
            try {
              toast({ message: text.loadingResets, variant: "info" });
              const [usage, data] = await Promise.all([loadUsage(), loadResetCredits()]);
              const credits = availableCredits(data.credits);
              if (!credits.length) {
                toast({ message: text.noResets, variant: "info" });
                return;
              }
              if (usage.rate_limit_reset_credits?.applicable_available_count === 0) {
                toast({ message: text.notApplicable, variant: "info" });
                return;
              }

              const creditID = await context.ui.dialog.select({
                title: text.resetListTitle,
                options: credits.map((credit) => ({
                  title: credit.title || "Full reset",
                  description: formatExpiry(credit.expires_at, locale),
                  value: credit.id,
                })),
              });
              const credit = credits.find((item) => item.id === creditID);
              if (!credit) return;
              const confirmed = await context.ui.dialog.confirm({
                title: text.resetConfirmTitle,
                message: text.resetConfirm(credit.title || "Full reset", formatExpiry(credit.expires_at, locale)),
                label: { confirm: text.resetCommandTitle, cancel: "Cancel" },
              });
              if (!confirmed) return;
              toast({ message: text.applyingReset, variant: "info" });
              const result = await consumeCredit(credit.id);
              toast({ ...result, duration: 10000 });
              void status.refresh();
            } catch (error) { showError(error); }
          },
        },
      ],
        }));
        return null;
      },
    });
    return () => status.dispose();
  },
};

// V1 invokes tui(api); V2 invokes setup(context). Neither API is translated into the other.
export default { ...v2, tui: legacy.tui };
