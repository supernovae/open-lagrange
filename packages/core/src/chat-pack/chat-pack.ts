import type { CapabilityDefinition, CapabilityPack } from "@open-lagrange/capability-sdk";
import { z } from "zod";
import { getCapabilitiesSummary } from "./capability-discovery.js";
import { routeIntent } from "./intent-router.js";
import { explainArtifact, explainApproval, explainError, explainSystem, summarizeStatus } from "./system-explainer.js";

const PACK_ID = "open-lagrange.chat";
const TextInput = z.object({ text: z.string().min(1).optional() }).passthrough();
const ArtifactInput = z.object({ artifact_id: z.string().min(1), kind: z.string().optional(), title: z.string().optional() }).strict();
const Output = z.record(z.string(), z.unknown());

export const chatPack: CapabilityPack = {
  manifest: {
    pack_id: PACK_ID,
    name: "Default Chat Pack",
    version: "0.1.0",
    description: "Read-only helpers for TUI explanations, capability discovery, and suggested flows.",
    publisher: "open-lagrange",
    license: "MIT",
    runtime_kind: "local_trusted",
    trust_level: "trusted_core",
    required_scopes: ["project:read"],
    provided_scopes: ["project:read"],
    default_policy: { read_only: true, secrets: "redacted" },
    open_cot_alignment: { portable: true, control_plane_surface: "tui-chat" },
  },
  capabilities: [
    capability("chat.explain_system", "Explain what Open Lagrange can do.", TextInput, (input) => ({ message: explainSystem(getCapabilitiesSummary()), text: input.text ?? "" })),
    capability("chat.list_capabilities", "List redacted runtime capabilities.", TextInput, () => ({ summary: getCapabilitiesSummary() })),
    capability("chat.classify_intent", "Classify a chat message into a suggested flow.", TextInput, (input) => routeIntent({ text: input.text ?? "" })),
    capability("chat.suggest_flow", "Suggest a validated flow for a chat message.", TextInput, (input) => routeIntent({ text: input.text ?? "" })),
    capability("chat.explain_artifact", "Explain an artifact summary.", ArtifactInput, (input) => ({ message: explainArtifact({ artifact_id: input.artifact_id, ...(input.kind ? { kind: input.kind } : {}), ...(input.title ? { title: input.title } : {}) }) })),
    capability("chat.explain_error", "Explain a runtime error.", TextInput, (input) => ({ message: explainError(input.text ?? "") })),
    capability("chat.summarize_status", "Summarize runtime status.", TextInput, () => ({ message: summarizeStatus(getCapabilitiesSummary()) })),
    capability("chat.generate_starter_plan", "Suggest starter flows.", TextInput, () => ({
      suggestions: [
        "/plan repo \"add json output to my cli\"",
        "/research brief \"MCP security risks\" --fixture",
        "/pack build ./skills.md",
        "/demo run repo-json-output",
      ],
    })),
  ],
};

function capability<Input>(name: string, description: string, inputSchema: z.ZodType<Input>, execute: (input: Input) => unknown): CapabilityDefinition {
  return {
    descriptor: {
      capability_id: `${PACK_ID}.${name}`,
      pack_id: PACK_ID,
      name,
      description,
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      risk_level: "read",
      side_effect_kind: "none",
      requires_approval: false,
      idempotency_mode: "recommended",
      timeout_ms: 10_000,
      max_attempts: 1,
      scopes: ["project:read"],
      tags: ["chat", "read-only"],
      examples: [],
    },
    input_schema: inputSchema as z.ZodType<unknown>,
    output_schema: Output,
    execute: (_context, value) => execute(inputSchema.parse(value)),
  };
}
