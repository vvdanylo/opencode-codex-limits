import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { registerStatus } from "./status.tsx";
import { loadStatus } from "./status-loader.ts";
import { displayText, validDisplayMode, validTimeFormat } from "./display.ts";
import { openSettings } from "./settings-menu.tsx";

const API_BASE = "https://chatgpt.com/backend-api/wham";

export type ResetCredit = {
  id: string;
  reset_type: string;
  status: string;
  expires_at?: string | null;
  title?: string | null;
};

let pendingRedemption: { creditId: string; requestId: string } | undefined;

export type Locale = "en" | "uk";

export const messages = {
  en: {
    missingAuth: "Could not find OpenCode/Codex auth.json.",
    missingAccessToken: (authPath: string) => `Access token not found in ${authPath}.`,
    sessionExpired: "OpenAI session expired. Run `opencode auth login openai` to reconnect.",
    usageRequestFailed: (status: number) => status === 401
      ? "OpenAI rejected this session (401). Run `opencode auth login openai` to reconnect."
      : `Usage API request failed (${status}).`,
    missingRateLimit: "The API response did not contain rate_limit.",
    missingWindows: "The API response did not contain usage limit windows.",
    availableResets: (count: number) => `${count} reset${count === 1 ? "" : "s"} available`,
    fiveHourWindow: "5 hours",
    weeklyWindow: "7 days",
    usageTitle: "Codex usage",
    noResets: "No banked resets are available.",
    notApplicable: "No usage window is eligible for a reset yet.",
    resetListTitle: "Choose a Codex reset",
    resetConfirmTitle: "Use this reset?",
    resetConfirm: (title: string, expires: string) =>
      `${title} (expires ${expires}). This uses one banked reset.`,
    resetSucceeded: "Codex usage limits were reset.",
    resetNotNeeded: "No usage window was reset; the credit remains available.",
    resetUnavailable: "No reset credit is available.",
    resetAlreadyUsed: "This reset request was already completed.",
    invalidResetResponse: "Unexpected reset response from OpenAI.",
    resetRequestFailed: (status: number) => `Reset request failed (${status}).`,
    resetsRequestFailed: (status: number) => status === 401
      ? "OpenAI rejected this session (401). Run `opencode auth login openai` to reconnect."
      : `Could not load resets (${status}).`,
    resetsCommandTitle: "List Codex resets",
    resetsCommandDescription: "Show available banked resets",
    resetCommandTitle: "Use a Codex reset",
    resetCommandDescription: "Choose and use a banked reset",
    loadingResets: "Fetching Codex resets...",
    applyingReset: "Applying Codex reset...",
    unknownReset: "unknown",
    used: "used",
    remaining: "remaining",
    resets: "resets",
    commandTitle: "Check Codex Limits",
    commandDescription: "Show current Codex usage limits",
    panelCommandTitle: "Toggle Codex usage panel",
    panelEnabled: "Codex usage panel enabled.",
    panelDisabled: "Codex usage panel hidden.",
    loading: "Fetching Codex usage limits...",
    error: (message: string) => `Codex limits error: ${message}`,
  },
  uk: {
    missingAuth: "Не знайдено auth.json OpenCode/Codex.",
    missingAccessToken: (authPath: string) => `Не знайдено токен доступу у ${authPath}.`,
    sessionExpired: "Сеанс OpenAI закінчився. Для повторного входу виконайте `opencode auth login openai`.",
    usageRequestFailed: (status: number) => status === 401
      ? "OpenAI відхилив сеанс (401). Для повторного входу виконайте `opencode auth login openai`."
      : `Помилка запиту до API лімітів (${status}).`,
    missingRateLimit: "У відповіді API немає rate_limit.",
    missingWindows: "У відповіді API немає вікон лімітів використання.",
    availableResets: (count: number) => `Доступно скидань: ${count}`,
    fiveHourWindow: "5 годин",
    weeklyWindow: "7 днів",
    usageTitle: "Використання Codex",
    noResets: "Немає доступних збережених скидань.",
    notApplicable: "Зараз немає ліміту, який можна скинути.",
    resetListTitle: "Оберіть скидання Codex",
    resetConfirmTitle: "Використати це скидання?",
    resetConfirm: (title: string, expires: string) =>
      `${title} (діє до ${expires}). Буде витрачено одне скидання.`,
    resetSucceeded: "Ліміти Codex скинуто.",
    resetNotNeeded: "Ліміти не скинуто; скидання залишилося доступним.",
    resetUnavailable: "Немає доступного скидання.",
    resetAlreadyUsed: "Цей запит на скидання вже виконано.",
    invalidResetResponse: "Неочікувана відповідь OpenAI на запит скидання.",
    resetRequestFailed: (status: number) => `Не вдалося виконати скидання (${status}).`,
    resetsRequestFailed: (status: number) => status === 401
      ? "OpenAI відхилив сеанс (401). Для повторного входу виконайте `opencode auth login openai`."
      : `Не вдалося отримати скидання (${status}).`,
    resetsCommandTitle: "Список скидань Codex",
    resetsCommandDescription: "Показати доступні збережені скидання",
    resetCommandTitle: "Використати скидання Codex",
    resetCommandDescription: "Обрати й використати скидання",
    loadingResets: "Отримання скидань Codex...",
    applyingReset: "Скидання лімітів Codex...",
    unknownReset: "невідомо",
    used: "використано",
    remaining: "залишилось",
    resets: "скидання",
    commandTitle: "Перевірити ліміти Codex",
    commandDescription: "Показати поточні ліміти використання Codex",
    panelCommandTitle: "Увімкнути або вимкнути панель лімітів Codex",
    panelEnabled: "Панель лімітів Codex увімкнено.",
    panelDisabled: "Панель лімітів Codex приховано.",
    loading: "Отримання лімітів Codex...",
    error: (message: string) => `Помилка лімітів Codex: ${message}`,
  },
} satisfies Record<Locale, Record<string, unknown>>;

export function getLocale(): Locale {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (/^uk(?:[-_]|$)/i.test(locale)) {
      return "uk";
    }
  } catch {
    // Fall through to the environment locale when Intl cannot resolve it.
  }

  const environmentLocale =
    process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? "";

  return /^uk(?:[-_]|$)/i.test(environmentLocale) ? "uk" : "en";
}

function getAuthFilePath(): string {
  const home = os.homedir();
  const openCodePath = [
    path.join(home, ".local", "share", "opencode", "auth.json"),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "opencode", "auth.json")
      : "",
  ].find((filePath) => filePath && fs.existsSync(filePath));
  const codexPath = path.join(home, ".codex", "auth.json");

  if (!openCodePath) return fs.existsSync(codexPath) ? codexPath : "";
  if (!fs.existsSync(codexPath)) return openCodePath;

  // Prefer Codex's current token only when both clients use the same account.
  try {
    const openCode = JSON.parse(fs.readFileSync(openCodePath, "utf-8"));
    const codex = JSON.parse(fs.readFileSync(codexPath, "utf-8"));
    const codexExpiry = JSON.parse(
      Buffer.from(codex.tokens?.access_token?.split(".")[1] ?? "", "base64url").toString("utf8"),
    ).exp;
    if (
      openCode.openai?.accountId &&
      openCode.openai.accountId === codex.tokens?.account_id &&
      codex.tokens.access_token &&
      openCode.openai.expires < Date.now() &&
      typeof codexExpiry === "number" && codexExpiry * 1000 > Date.now() + 60_000
    ) {
      return codexPath;
    }
  } catch {
    // Let the selected auth file report its own parse error below.
  }

  return openCodePath;
}

export function getAuthEmail(): string | undefined {
  try {
    const authPath = getAuthFilePath();
    if (!authPath) return undefined;
    const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
    const tokens = auth.openai ?? auth.tokens ?? auth;
    const jwt = tokens.id_token ?? tokens.access ?? tokens.access_token;
    if (typeof jwt !== "string") return undefined;
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"));
    const email = claims.email ?? claims["https://api.openai.com/profile"]?.email;
    return typeof email === "string" && email.includes("@") ? email : undefined;
  } catch {
    return undefined;
  }
}

export async function getValidToken(locale: Locale): Promise<string> {
  const text = messages[locale];
  const authPath = getAuthFilePath();

  if (!authPath) {
    throw new Error(text.missingAuth);
  }

  const authText = fs.readFileSync(authPath, "utf-8");
  const auth = JSON.parse(authText);

  const openai = auth.openai ?? auth.tokens ?? auth;

  const token = openai.access ?? openai.access_token;

  if (!token) {
    throw new Error(text.missingAccessToken(authPath));
  }

  const expires = openai.expires;

  if (typeof expires === "number" && expires <= Date.now()) {
    throw new Error(text.sessionExpired);
  }

  return token;
}

async function openAiRequest(
  locale: Locale,
  pathname: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<Response> {
  const token = tokenOverride ?? await getValidToken(locale);
  return fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "codex-cli",
      ...init.headers,
    },
  });
}

export async function loadUsage(locale: Locale, token?: string): Promise<any> {
  const text = messages[locale];
  const response = await openAiRequest(locale, "/usage", {}, token);

  if (!response.ok) {
    throw new Error(text.usageRequestFailed(response.status));
  }

  return response.json();
}

export async function loadResetCredits(locale: Locale, token?: string): Promise<{
  available_count: number;
  credits: ResetCredit[];
}> {
  const response = await openAiRequest(locale, "/rate-limit-reset-credits", {}, token);
  if (!response.ok) {
    throw new Error(messages[locale].resetsRequestFailed(response.status));
  }
  const data = await response.json();
  if (!Array.isArray(data.credits) || typeof data.available_count !== "number") {
    throw new Error(messages[locale].invalidResetResponse);
  }
  return data;
}

export function formatExpiry(expiresAt: string | null | undefined, locale: Locale): string {
  if (!expiresAt) return messages[locale].unknownReset;
  const date = new Date(expiresAt);
  return Number.isNaN(date.valueOf())
    ? messages[locale].unknownReset
    : date.toLocaleString(locale === "uk" ? "uk-UA" : "en-US");
}

export async function consumeResetCredit(locale: Locale, creditId: string, token: string): Promise<{
  message: string;
  variant: "success" | "info";
}> {
  const requestId = pendingRedemption?.creditId === creditId
    ? pendingRedemption.requestId
    : randomUUID();
  pendingRedemption = { creditId, requestId };
  const response = await openAiRequest(locale, "/rate-limit-reset-credits/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redeem_request_id: requestId, credit_id: creditId }),
  }, token);
  if (!response.ok) {
    throw new Error(messages[locale].resetRequestFailed(response.status));
  }
  const data = await response.json();
  if (["reset", "nothing_to_reset", "no_credit", "already_redeemed"].includes(data.code)) {
    pendingRedemption = undefined;
  }
  switch (data.code) {
    case "reset": return { message: messages[locale].resetSucceeded, variant: "success" };
    case "nothing_to_reset": return { message: messages[locale].resetNotNeeded, variant: "info" };
    case "no_credit": return { message: messages[locale].resetUnavailable, variant: "info" };
    case "already_redeemed": return { message: messages[locale].resetAlreadyUsed, variant: "success" };
    default: throw new Error(messages[locale].invalidResetResponse);
  }
}

export async function loadCodexLimits(locale: Locale): Promise<string> {
  const text = messages[locale];
  const data = await loadUsage(locale);

  const rateLimit = data.rate_limit;

  if (!rateLimit) {
    throw new Error(text.missingRateLimit);
  }

  const windows = [rateLimit.primary_window, rateLimit.secondary_window].filter(
    (window: any) => window && (!window.limit_window_seconds || window.limit_window_seconds < 28 * 86400),
  );

  if (windows.length === 0) {
    throw new Error(text.missingWindows);
  }

  const formatReset = (resetAt?: number) => {
    if (!resetAt) {
      return text.unknownReset;
    }

    return new Date(resetAt * 1000).toLocaleString(
      locale === "uk" ? "uk-UA" : "en-US",
      {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  };

  const formatWindow = (window: any) => {
    const used = window.used_percent;
    const remaining = typeof used === "number" && Number.isFinite(used)
      ? `${Math.max(0, Math.min(100, Math.round(100 - used)))}%`
      : "?";

    const seconds = window.limit_window_seconds;

    let name = "Limit";

    if (seconds === 18000) {
      name = text.fiveHourWindow;
    } else if (seconds === 604800) {
      name = text.weeklyWindow;
    } else if (seconds) {
      const hours = seconds / 3600;

      if (hours < 24) {
        name = `${hours}h`;
      } else {
        name = `${Math.round(hours / 24)}d`;
      }
    }

    return `${name}: ${remaining} ${text.remaining}, ${text.resets} ${formatReset(window.reset_at)}`;
  };

  const count = data.rate_limit_reset_credits?.available_count;
  return [
    ...windows.map(formatWindow),
    typeof count === "number" ? text.availableResets(count) : null,
  ].filter(Boolean).join("\n");
}

const plugin = {
  id: "local.codex-limits",

  async tui(api: any, options?: { showPanel?: boolean; showResets?: boolean; showResetExpiry?: boolean; displayMode?: string; timeFormat?: string }) {
    const locale = getLocale();
    const text = messages[locale];
    const status = registerStatus(api, () => loadStatus(locale, () => loadUsage(locale), () => loadResetCredits(locale)), {
      displayMode: validDisplayMode(options?.displayMode),
      showPanel: options?.showPanel !== false,
      showResets: options?.showResets === true,
      showResetExpiry: options?.showResetExpiry !== false,
      timeFormat: validTimeFormat(options?.timeFormat),
    }, locale, getAuthEmail);
    const showError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[codex-limits]", error);
      api.ui.toast({ message: text.error(message), variant: "error", duration: 10000 });
    };

    const availableCredits = (credits: ResetCredit[]) =>
      credits.filter((credit) => credit.status === "available" && credit.reset_type === "codex_rate_limits");

    const describeCredit = (credit: ResetCredit) =>
      `${credit.title || "Full reset"} · ${formatExpiry(credit.expires_at, locale)}`;

    const dispose = api.keymap.registerLayer({
      commands: [
        {
          namespace: "palette",
          name: "codex-settings",
          title: displayText[locale].settings,
          category: "Codex",
          slashName: "codex-settings",
          run: () => openSettings(status, locale, {
            show: (render, onClose) => api.ui.dialog.replace(render, onClose),
            clear: () => api.ui.dialog.clear(),
          }, status.colors, showError),
        },
        {
          namespace: "palette",
          name: "codex-panel",
          title: text.panelCommandTitle,
          category: "Codex",
          slashName: "codex-panel",
          run: async () => {
            const enabled = await status.togglePanel();
            api.ui.toast({ message: enabled ? text.panelEnabled : text.panelDisabled, variant: "info" });
          },
        },
        {
          namespace: "palette",

          name: "codex-limits",

          title: text.commandTitle,

          desc: text.commandDescription,

          category: "Codex",

          slashName: "codex-limits",

          run: async () => {
            try {
              api.ui.toast({
                message: text.loading,

                variant: "info",
              });

              const message = await loadCodexLimits(locale);
              void status.refresh();

              api.ui.toast({
                title: text.usageTitle,
                message,

                variant: "success",

                duration: 8000,
              });
            } catch (error) { showError(error); }
          },
        },
        {
          namespace: "palette",
          name: "codex-resets",
          title: text.resetsCommandTitle,
          desc: text.resetsCommandDescription,
          category: "Codex",
          slashName: "codex-resets",
          run: async () => {
            try {
              api.ui.toast({ message: text.loadingResets, variant: "info" });
              const data = await loadResetCredits(locale);
              const credits = availableCredits(data.credits);
              api.ui.toast({
                message: credits.length
                  ? `${text.availableResets(data.available_count)} | ${credits.map(describeCredit).join(" | ")}`
                  : text.noResets,
                variant: "info",
                duration: 12000,
              });
            } catch (error) { showError(error); }
          },
        },
        {
          namespace: "palette",
          name: "codex-reset",
          title: text.resetCommandTitle,
          desc: text.resetCommandDescription,
          category: "Codex",
          slashName: "codex-reset",
          run: async () => {
            try {
              api.ui.toast({ message: text.loadingResets, variant: "info" });
              const token = await getValidToken(locale);
              const [usage, data] = await Promise.all([loadUsage(locale, token), loadResetCredits(locale, token)]);
              const credits = availableCredits(data.credits);
              if (!credits.length) {
                api.ui.toast({ message: text.noResets, variant: "info" });
                return;
              }
              if (usage.rate_limit_reset_credits?.applicable_available_count === 0) {
                api.ui.toast({ message: text.notApplicable, variant: "info" });
                return;
              }

              api.ui.dialog.replace(() => api.ui.DialogSelect({
                title: text.resetListTitle,
                options: credits.map((credit) => ({
                  title: credit.title || "Full reset",
                  description: formatExpiry(credit.expires_at, locale),
                  value: credit,
                })),
                onSelect: (option: { value: ResetCredit }) => {
                  const credit = option.value;
                  let applying = false;
                  api.ui.dialog.replace(() => api.ui.DialogConfirm({
                    title: text.resetConfirmTitle,
                    message: text.resetConfirm(credit.title || "Full reset", formatExpiry(credit.expires_at, locale)),
                    onCancel: () => api.ui.dialog.clear(),
                    onConfirm: () => {
                      if (applying) return;
                      applying = true;
                      api.ui.dialog.clear();
                      api.ui.toast({ message: text.applyingReset, variant: "info" });
                      consumeResetCredit(locale, credit.id, token)
                        .then(({ message, variant }) => {
                          api.ui.toast({ message, variant, duration: 10000 });
                          void status.refresh();
                        })
                        .catch(showError);
                    },
                  }));
                },
              }));
            } catch (error) { showError(error); }
          },
        },
      ],
    });

    api.lifecycle?.onDispose?.(() => {
      if (typeof dispose === "function") {
        dispose();
      }
    });
  },
};

export default plugin;
