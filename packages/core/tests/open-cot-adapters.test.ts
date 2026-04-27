import { describe, expect, it } from "vitest";
import { extendOpenCotCapabilitySnapshot, toOpenCotArtifact, validateOpenCotArtifactForReconciliation } from "../src/open-cot/adapters.js";
import type { CognitiveArtifact } from "../src/schemas/open-cot.js";

describe("Open-COT adapters", () => {
  it("preserves portable artifact and capability snapshot fields", () => {
    const capabilitySnapshot = extendOpenCotCapabilitySnapshot({
      snapshot_id: "snapshot-test",
      created_at: "2026-04-27T16:00:00.000Z",
      capabilities_hash: "b".repeat(64),
      capabilities: [],
    });
    const artifact: CognitiveArtifact = {
      artifact_id: "artifact-test",
      schema_version: "open-cot.core.v1",
      capability_snapshot_id: capabilitySnapshot.snapshot_id,
      intent_verification: {
        objective: "Create a short summary.",
        request_boundaries: ["No writes"],
        allowed_scope: ["project:read"],
        prohibited_scope: ["project:write"],
      },
      assumptions: [],
      reasoning_trace: {
        evidence_mode: "audit_summary",
        summary: "Prepared a bounded artifact.",
        steps: [],
      },
      execution_intents: [],
      observations: [],
      uncertainty: { level: "low", explanation: "Mock fixture" },
    };

    expect(toOpenCotArtifact(artifact)).toEqual(artifact);
    expect(validateOpenCotArtifactForReconciliation({ artifact, capability_snapshot: capabilitySnapshot })).toMatchObject({
      ok: true,
      artifact,
    });
  });
});
