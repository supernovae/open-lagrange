import { describe, expect, it } from "vitest";
import type { ResearchCommandResult } from "@open-lagrange/core/research";
import { researchMessage, researchStatus } from "./useUserFrameEvents.js";

describe("useUserFrameEvents research output", () => {
  it("promotes failed nested research results to failed TUI output", () => {
    const result: ResearchCommandResult = {
      run_id: "research-test",
      output_dir: "/tmp/research-test",
      artifacts: [],
      warnings: [],
      result: {
        status: "failed",
        structured_errors: [{ code: "MCP_EXECUTION_FAILED", message: "HTTP response exceeded max_bytes." }],
      },
    };

    expect(researchStatus(result)).toBe("failed");
    expect(researchMessage("Fetch", result)).toContain("Research Fetch failed");
    expect(researchMessage("Fetch", result)).toContain("HTTP response exceeded max_bytes.");
  });

  it("treats non-success nested research statuses as failed", () => {
    const result: ResearchCommandResult = {
      run_id: "research-test",
      output_dir: "/tmp/research-test",
      artifacts: [],
      warnings: [],
      result: { status: "yielded" },
    };

    expect(researchStatus(result)).toBe("failed");
  });
});
