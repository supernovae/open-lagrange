import { describe, expect, it } from "vitest";
import { deterministicProjectId, deterministicTaskRunId } from "../src/ids/deterministic-ids.js";

describe("deterministic ids", () => {
  it("derives stable project and task IDs", () => {
    const projectInput = {
      goal: "Create a short README summary for this repository.",
      workspace_id: "workspace-local",
      principal_id: "human-local",
      delegate_id: "open-lagrange-cli",
    };

    expect(deterministicProjectId(projectInput)).toBe(deterministicProjectId(projectInput));
    expect(deterministicTaskRunId({
      project_id: deterministicProjectId(projectInput),
      plan_version: "v1",
      task_index: 0,
      task_title: "Create README summary",
    })).toBe(deterministicTaskRunId({
      project_id: deterministicProjectId(projectInput),
      plan_version: "v1",
      task_index: 0,
      task_title: "Create README summary",
    }));
  });
});
