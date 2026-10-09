/** @jsxImportSource @opentui/solid */
import { createSignal, Show } from "solid-js";
import { compactResetText, displayText, formatLimitReset, resetDisplay, timeFormat } from "./display.ts";
import type { StatusControls } from "./status-controller.ts";

export type StatusColors = { text: any; muted: any; error: any; warning: any; success: any };

export function StatusView(props: { status: StatusControls; compact?: boolean; locale: "en" | "uk"; colors: () => StatusColors; accountEmail?: () => string | undefined }) {
  const [width, setWidth] = createSignal(80);
  const text = displayText[props.locale];
  const status = props.status;
  const email = () => { status.now(); return props.accountEmail?.(); };
  const color = (remaining?: number) => remaining === undefined ? props.colors().muted
    : remaining < 20 ? props.colors().error : remaining < 50 ? props.colors().warning : props.colors().success;
  const resets = () => resetDisplay(status.getSettings(), status.usage()?.resets, status.usage()?.resetExpiries ?? [], status.now(), props.locale);
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
      {email() && <text fg={props.colors().muted}>{email()}</text>}
      {(status.usage()?.windows ?? []).map((window) => (
        <box flexDirection="row" width="100%">
          <text width={10}>{window.label}</text>
          <text width={6} fg={color(window.remainingPercent)}>{window.remaining}</text>
          <text fg={props.colors().muted}>{window.resetAt === undefined ? window.reset
            : formatLimitReset(window.resetAt, timeFormat(status.getSettings()), status.now(), props.locale)}</text>
        </box>
      ))}
      {(resets().count || resets().expiry) && <text>
        {resets().count}{resets().count && resets().expiry ? " · " : ""}
        <span style={{ fg: resets().urgent ? props.colors().error : props.colors().muted }}>{resets().expiry}</span>
      </text>}
      {!status.usage() && <text>{status.error() ?? text.loading}</text>}
    </box>
  }>
    <text width="100%" wrapMode="none" onSizeChange={function () { setWidth(this.width); }}>
      {prefix()}
      {email() && <span> · {email()}</span>}
      {(status.usage()?.windows ?? []).map((window, index) => (
        <span>{separator(index)}{label(window.label)}:{tight() ? "" : " "}<span style={{ fg: color(window.remainingPercent) }}>{window.remaining}</span></span>
      ))}
      {!status.usage() && <span> · {status.error() ?? text.loading}</span>}
      {compactResets().count && <span> · {compactResets().count}</span>}
      {compactResets().expiry && <span style={{ fg: resets().urgent ? props.colors().error : props.colors().muted }}> · {compactResets().expiry}</span>}
    </text>
  </Show>;
}
