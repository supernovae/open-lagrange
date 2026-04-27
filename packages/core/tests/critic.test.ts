import { describe, expect, it } from "vitest";
import { runMockCritic } from "../src/activities/cognition.js";

describe("critic pass", () => {
  it("can request revise without recursive execution", async () => {
    const result = await runMockCritic({
      scoped_task: {
        task_id: "task-test",
        title: "Create README summary",
        objective: "Create a short README summary for this repository.",
        allowed_scopes: ["project:read"],
        allowed_capabilities: ["draft_readme_summary"],
        max_risk_level: "read",
      },
      output: { content: "summary" },
      force_outcome: "revise",
    });

    expect(result).toMatchObject({
      outcome: "revise",
      summary: expect.stringContaining("unsupported"),
    });
  });
});
