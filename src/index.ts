import { Plugin } from "@opencode/plugin";
import { codexRpc } from "./connection-rpc.ts";

const API_BASE = "https://chatgpt.com/backend-api/wham";

function emailFromToken(token: string): string | undefined {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    const email = claims.email ?? claims["https://api.openai.com/profile"]?.email;
    return typeof email === "string" ? email : undefined;
  } catch { return undefined; }
}

// V2 resolves the active OpenCode credential on the server and returns only
// usage data to the TUI. V1 uses the separate legacy entrypoint.
export default {
  ...Plugin.define({
    id: "local.codex-limits",
    async setup(context) {
      const credential = async () => {
        const connection = await context.integration.connection.active("openai");
        if (!connection) throw new Error("OpenAI sign-in required.");
        const value = await context.integration.connection.resolve(connection);
        if (!value || value.type !== "oauth") throw new Error("Connect an OpenAI OAuth account to view Codex limits.");
        if (value.expires <= Date.now()) throw new Error("OpenAI session expired.");
        return value;
      };
      const request = async (pathname: string, init?: RequestInit) => {
        const auth = await credential();
        const response = await fetch(`${API_BASE}${pathname}`, {
          ...init,
          headers: { Authorization: `Bearer ${auth.access}`, Accept: "application/json", "User-Agent": "codex-cli", ...init?.headers },
        });
        if (!response.ok) throw new Error(response.status === 401 ? "OpenAI sign-in required (401)." : `OpenAI usage request failed (${response.status}).`);
        return response.json();
      };
      await context.rpc.register(codexRpc, {
        identity: async () => ({ email: emailFromToken((await credential()).access) }),
        usage: async () => request("/usage"),
        credits: async () => request("/rate-limit-reset-credits"),
        consume: async ({ creditId, requestId }: { creditId: string; requestId: string }) => {
          const result = await request("/rate-limit-reset-credits/consume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ redeem_request_id: requestId, credit_id: creditId }),
          });
          return { code: result.code };
        },
      });
    },
  }),
  async server() {
    return {};
  },
};
