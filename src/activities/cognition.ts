import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import {
  CognitiveArtifact,
  type CognitiveArtifact as CognitiveArtifactType,
  type Observation,
} from "../schemas/open-cot.js";
import { newId } from "../util/hash.js";

export interface CognitionInput {
  readonly user_prompt: string;
  readonly capability_snapshot: CapabilitySnapshot;
  readonly prior_observations?: readonly Observation[];
}

export async function runCognitiveStep(input: CognitionInput): Promise<CognitiveArtifactType> {
  if (!process.env.OPENAI_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
    return deterministicCognitiveStep(input);
  }

  const { object } = await generateObject({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    schema: CognitiveArtifact,
    system: [
      "You emit a structured cognitive artifact only.",
      "You do not execute capabilities.",
      "You do not call MCP.",
      "You may only reference capabilities present in the provided capability snapshot.",
      "If no listed capability fits, return no execution intent and include a yield reason.",
      "The reasoning trace is explanatory only and has no authority.",
    ].join("\n"),
    prompt: JSON.stringify({
      user_prompt: input.user_prompt,
      capability_snapshot: input.capability_snapshot,
      prior_observations: input.prior_observations ?? [],
    }),
  });

  return CognitiveArtifact.parse(object);
}

export function deterministicCognitiveStep(input: CognitionInput): CognitiveArtifactType {
  const requested = chooseCapability(input);
  const execution_intents = requested
    ? [{
        intent_id: newId("intent"),
        snapshot_id: input.capability_snapshot.snapshot_id,
        endpoint_id: requested.endpoint_id,
        capability_name: requested.capability_name,
        capability_digest: requested.capability_digest,
        risk_level: requested.risk_level,
        requires_approval: requested.requires_approval,
        idempotency_key: newId("idem"),
        arguments: argumentsFor(input.user_prompt, requested.capability_name),
        preconditions: ["Capability appears in the injected snapshot"],
        expected_result_shape: requested.output_schema,
        postconditions: ["Record a structured observation"],
      }]
    : [];

  return CognitiveArtifact.parse({
    artifact_id: newId("artifact"),
    schema_version: "open-cot.core.v1",
    capability_snapshot_id: input.capability_snapshot.snapshot_id,
    intent_verification: {
      objective: input.user_prompt,
      request_boundaries: ["Use only injected capabilities", "Do not assume ambient execution"],
      allowed_scope: input.capability_snapshot.capabilities.map(
        (capability) => `${capability.endpoint_id}.${capability.capability_name}`,
      ),
      prohibited_scope: ["Capabilities absent from the snapshot", "Direct side effects"],
    },
    observations: [...(input.prior_observations ?? [])],
    assumptions: ["This deterministic fallback is used when no provider key is configured"],
    reasoning_trace: {
      evidence_mode: "audit_summary",
      summary: requested
        ? "Selected a capability from the injected snapshot."
        : "No matching capability was available.",
      steps: [{
        step_id: newId("trace"),
        kind: requested ? "verification" : "yield",
        content: requested
          ? "Selected a capability from the injected snapshot."
          : "No matching capability was available.",
        visibility: "audit_summary",
        confidence: requested ? 0.8 : 0.4,
      }],
    },
    execution_intents,
    uncertainty: {
      level: requested ? "low" : "medium",
      explanation: requested ? "A matching mocked capability was found." : "No matching capability was found.",
    },
    yield_reason: requested ? undefined : "No compatible capability in snapshot",
  });
}

function chooseCapability(input: CognitionInput) {
  const prompt = input.user_prompt.toLowerCase();
  if (prompt.includes("write")) {
    return input.capability_snapshot.capabilities.find(
      (capability) => capability.capability_name === "write_note",
    );
  }
  if (prompt.includes("read")) {
    return input.capability_snapshot.capabilities.find(
      (capability) => capability.capability_name === "read_file",
    );
  }
  return input.capability_snapshot.capabilities.find(
    (capability) => capability.capability_name === "search_docs",
  );
}

function argumentsFor(prompt: string, capabilityName: string): Record<string, unknown> {
  if (capabilityName === "write_note") {
    return { path: "notes/reconciliation.txt", content: "mock note" };
  }
  if (capabilityName === "read_file") {
    return { path: "README.md" };
  }
  return { query: prompt };
}
