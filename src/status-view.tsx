/** @jsxImportSource @opentui/solid */
import { createSignal, Show } from "solid-js";
import { compactResetText, displayText, formatLimitReset, resetDisplay, timeFormat } from "./display.ts";
import type { StatusControls } from "./status-controller.ts";

export type StatusColors = { text: any; muted: any; error: any; warning: any; success: any };

export function StatusView(props: { status: StatusControls; compact?: boolean; locale: "en" | "uk"; colors: () => StatusColors; accountEmail?: () => string | undefined; onReconnect?: () => void }) {
  const [width, setWidth] = createSignal(80);
  const text = displayText[props.locale];
  const status = props.status;
  const email = () => { status.now(); return props.accountEmail?.(); };
  const reconnectNeeded = () => /sign-in required|session expired|rejected this session|connect an openai oauth account|сеанс.+закінчився|відхилив сеанс|\b401\b/i.test(status.error() ?? "");
  const errorText = () => reconnectNeeded() && props.onReconnect
    ? props.locale === "uk" ? "Потрібен повторний вхід до OpenAI." : "OpenAI sign-in required."
    : status.error();
  const color = (remaining?: number) => remaining === undefined ? props.colors().muted
    : remaining < 20 ? props.colors().error : remaining < 50 ? props.colors().warning : props.colors().success;
  const resets = () => resetDisplay(status.getSettings(), status.usage()?.resets, status.usage()?.resetExpiries ?? [], status.now(), props.locale);
  const inlineDate = (resetAt: number) => formatLimitReset(resetAt, "absolute", status.now(), props.locale)
    .replace(/\s+(?:at|о)\s+/, " ");
  const inlineWait = (resetAt: number) => {
    const remaining = resetAt - status.now();
    if (remaining <= 0) return "";
    if (remaining < 86400_000) return formatLimitReset(resetAt, "countdown", status.now(), props.locale)
      .replace(/^(?:in |через )/, "");
    const hours = Math.ceil(remaining / 3600_000);
    const days = Math.floor(hours / 24);
    return `${days}${text.day}${hours % 24 ? ` ${hours % 24}${text.hour}` : ""}`;
  };
  const label = (value: string) => value === "Weekly" ? (props.locale === "uk" ? "7д" : "7d")
    : value === "5h" && props.locale === "uk" ? "5г" : value;
  const tight = () => width() < 50 && Boolean(resets().count || resets().expiry);
  const prefix = () => tight() ? "" : "Codex";
  const separator = (index: number) => tight() ? (index ? " " : "") : " · ";
  const compactResets = () => {
    const base = prefix() + (status.usage()?.windows ?? []).map((window, index) => `${separator(index)}${label(window.label)}:${tight() ? "" : " "}${window.remaining}`).join("");
    return compactResetText(resets(), Math.max(0, width() - base.length - 3), props.locale);
  };
  return <Show when={props.compact} fallback={
    <box flexDirection="column" width="100%" paddingTop={1}>
      <text fg={props.colors().text}>{text.usage}</text>
      {email() && <text fg="#64b5f6">{email()}</text>}
      {(status.usage()?.windows ?? []).map((window) => (
        <box flexDirection="row" width="100%">
          <text width={7} fg="#64b5f6">{window.label}</text>
          <text width={5} fg={color(window.remainingPercent)}>{window.remaining}</text>
          <text fg={props.colors().muted} wrapMode="none">
            {window.resetAt === undefined ? window.reset
              : timeFormat(status.getSettings()) === "absolute" ? inlineDate(window.resetAt)
                : formatLimitReset(window.resetAt, "countdown", status.now(), props.locale)}
            {window.resetAt !== undefined && timeFormat(status.getSettings()) === "absolute" &&
              inlineWait(window.resetAt) && <span style={{ fg: "#64b5f6" }}> ({inlineWait(window.resetAt)})</span>}
          </text>
        </box>
      ))}
      {(resets().count || resets().expiry) && <text>
        <span style={{ fg: props.colors().success }}>{resets().count}</span>{resets().count && resets().expiry ? " · " : ""}
        <span style={{ fg: resets().urgent ? props.colors().error : props.colors().muted }}>{resets().expiry}</span>
      </text>}
      {!status.usage() && <text fg={status.error() ? props.colors().error : props.colors().muted}>{errorText() ?? text.loading}</text>}
      {reconnectNeeded() && props.onReconnect && <text fg={props.colors().warning} onMouseUp={props.onReconnect}>▶ Reconnect OpenAI</text>}
    </box>
  }>
    <text width="100%" wrapMode="none" onSizeChange={function () { setWidth(this.width); }}>
      {prefix()}
      {email() && <span style={{ fg: "#64b5f6" }}> · {email()}</span>}
      {(status.usage()?.windows ?? []).map((window, index) => (
        <span>{separator(index)}{label(window.label)}:{tight() ? "" : " "}<span style={{ fg: color(window.remainingPercent) }}>{window.remaining}</span></span>
      ))}
      {!status.usage() && <span style={{ fg: status.error() ? props.colors().error : props.colors().muted }}> · {errorText() ?? text.loading}</span>}
      {reconnectNeeded() && props.onReconnect && <span style={{ fg: props.colors().warning }}> · /codex-reconnect</span>}
      {compactResets().count && <span> · {compactResets().count}</span>}
      {compactResets().expiry && <span style={{ fg: resets().urgent ? props.colors().error : props.colors().muted }}> · {compactResets().expiry}</span>}
    </text>
  </Show>;
}
