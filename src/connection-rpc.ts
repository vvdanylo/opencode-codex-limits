export const codexRpc = {
  id: "codex-limits",
  methods: {
    identity: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", properties: { email: { type: "string" } }, additionalProperties: false },
    },
    usage: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", additionalProperties: true },
    },
    credits: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", additionalProperties: true },
    },
    consume: {
      input: {
        type: "object",
        properties: { creditId: { type: "string" }, requestId: { type: "string" } },
        required: ["creditId", "requestId"],
        additionalProperties: false,
      },
      output: { type: "object", properties: { code: { type: "string" } }, required: ["code"], additionalProperties: false },
    },
  },
  events: {},
} as const;
