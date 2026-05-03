import { afterEach, describe, expect, it, vi } from "vitest";
import { inMemoryApprovalStore } from "../src/approval/approval-store.js";
import { inMemoryStatusStore } from "../src/status/status-store.js";
import { setStateStoreForTests } from "../src/storage/state-store.js";
import { getRuntimeHealth, submitUserFrameEvent } from "../src/user-frame-events.js";

function useMemoryStore(): void {
  setStateStoreForTests({ ...inMemoryStatusStore, ...inMemoryApprovalStore });
}

describe("user frame events", () => {
  afterEach(() => {
    setStateStoreForTests(undefined);
    vi.unstubAllEnvs();
  });

  it("records goal refinements as project observations", async () => {
    useMemoryStore();
    const project_id = "project_user_frame_refine";
    await inMemoryStatusStore.recordProjectStatus({
      project_id,
      project_run_id: "project_run_user_frame_refine",
      status: "running",
      task_run_ids: [],
      observations: [],
      errors: [],
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await submitUserFrameEvent({
      type: "refine_goal",
      project_id,
      text: "Only update apps/cli.",
    });

    expect(result.status).toBe("completed");
    const status = await inMemoryStatusStore.getProjectStatus(project_id);
    expect(status?.observations.at(-1)?.summary).toBe("Goal refinement recorded.");
  });

  it("answers explanation requests from current status without execution", async () => {
    useMemoryStore();
    const project_id = "project_user_frame_explain";
    await inMemoryStatusStore.recordProjectStatus({
      project_id,
      project_run_id: "project_run_user_frame_explain",
      status: "requires_approval",
      task_run_ids: ["task_run_user_frame_explain"],
      observations: [],
      errors: [],
      final_message: "Waiting for approval.",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await inMemoryStatusStore.recordTaskStatus({
      project_id,
      task_id: "repository-task",
      task_run_id: "task_run_user_frame_explain",
      status: "requires_approval",
      observations: [],
      errors: [],
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await submitUserFrameEvent({
      type: "ask_explanation",
      project_id,
      task_id: "task_run_user_frame_explain",
      text: "Why did this pause?",
    });

    expect(result.status).toBe("completed");
    expect(result.message).toContain("Project is requires_approval");
  });

  it("reports local OpenAI-compatible model providers as configured without a key", async () => {
    vi.stubEnv("OPEN_LAGRANGE_MODEL_PROVIDER", "local");
    vi.stubEnv("OPEN_LAGRANGE_MODEL_BASE_URL", "https://coder.kybern.dev/v1");
    vi.stubEnv("OPEN_LAGRANGE_MODEL", "core");

    const health = await getRuntimeHealth();

    expect(health.model).toBe("configured");
  });
});
