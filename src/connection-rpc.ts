export const codexRpc = {
  id: "codex-limits",
  methods: {
    identity: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", properties: { email: { type: "string" } }, additionalProperties: false },
    },
    accounts: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          accounts: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, label: { type: "string" }, email: { type: "string" } },
              required: ["id", "label", "email"],
              additionalProperties: false,
            },
          },
        },
        required: ["accounts"],
        additionalProperties: false,
      },
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
