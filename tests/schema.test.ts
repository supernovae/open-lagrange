import { describe, expect, it } from "vitest";
import { CognitiveArtifact } from "../src/schemas/open-cot.js";

describe("open cot compatibility schemas", () => {
  it("rejects invalid cognitive artifacts", () => {
    const parsed = CognitiveArtifact.safeParse({
      schema_version: "open-cot.core.v1",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects pre-Core v1 field names", () => {
    const parsed = CognitiveArtifact.safeParse({
      artifact_id: "artifact-1",
      schema_version: "open-cot.core.v1",
      capability_snapshot_id: "snapshot-1",
      intent_verification: {
        interpreted_user_objective: "search",
        request_boundaries: [],
        believed_allowed_requests: [],
        prohibited_requests: [],
      },
      assumptions: [],
      reasoning_trace: [],
      execution_intent: [],
      observations: [],
      uncertainty: { level: "low", explanation: "test" },
    });

    expect(parsed.success).toBe(false);
  });
});
