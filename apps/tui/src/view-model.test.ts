import type { ProjectRunStatus, TaskStatusSnapshot } from "@open-lagrange/core/interface";
import { describe, expect, it } from "vitest";
import type { ReconciliationTimelineItem } from "./types.js";
import { buildViewModel, sortTimeline } from "./view-model.js";

const updatedAt = "2026-01-01T00:00:00.000Z";

function taskStatus(overrides: Partial<TaskStatusSnapshot> = {}): TaskStatusSnapshot {
  return {
    project_id: "project-1",
    task_id: "task-1",
    task_run_id: "task-run-1",
    status: "requires_approval",
    observations: [],
    errors: [],
    updated_at: updatedAt,
    repository_status: {
      workspace_id: "workspace-1",
      repo_root: ".",
      current_phase: "awaiting_approval",
      inspected_files: ["README.md"],
      planned_files: ["README.md"],
      changed_files: ["README.md"],
      verification_results: [{
        command_id: "npm_run_typecheck",
        command: "npm run typecheck",
        exit_code: 0,
        stdout_preview: "ok",
        stderr_preview: "",
        duration_ms: 1250,
        truncated: false,
      }],
      diff_summary: " README.md | 2 +",
      diff_text: "diff --git a/README.md b/README.md",
      review_report: {
        pr_title: "Update README",
        pr_summary: "Adds a short note.",
        test_notes: ["typecheck passed"],
        risk_notes: ["docs only"],
        follow_up_notes: [],
      },
      approval_request: {
        approval_request_id: "approval-1",
        task_id: "task-1",
        project_id: "project-1",
        intent_id: "intent-1",
        requested_risk_level: "write",
        requested_capability: "repo.apply_patch",
        task_run_id: "task-run-1",
        requested_at: updatedAt,
        prompt: "Approve README patch",
        trace_id: "trace-1",
      },
      errors: [],
      observations: [],
    },
    ...overrides,
  };
}

function projectStatus(): ProjectRunStatus {
  return {
    project_id: "project-1",
    project_run_id: "project-run-1",
    task_statuses: [taskStatus()],
    status: {
      project_id: "project-1",
      project_run_id: "project-run-1",
      status: "requires_approval",
      task_run_ids: ["task-run-1"],
      observations: [{
        observation_id: "obs-1",
        status: "recorded",
        summary: "Capability snapshot created.",
        observed_at: updatedAt,
      }],
      errors: [],
      final_message: "Waiting for approval.",
      updated_at: updatedAt,
    },
  };
}

describe("TUI view model", () => {
  it("maps project status into cockpit sections", () => {
    const view = buildViewModel({
      project: projectStatus(),
      selectedPane: "approvals",
      inputMode: "chat",
      isLoading: false,
    });

    expect(view.activeTask?.task_run_id).toBe("task-run-1");
    expect(view.approvals).toHaveLength(1);
    expect(view.changedFiles).toEqual([{ path: "README.md" }]);
    expect(view.verificationResults[0]?.command_id).toBe("npm_run_typecheck");
    expect(view.artifacts.map((item) => item.artifact_type)).toEqual(["diff", "verification", "review"]);
    expect(view.timeline.map((item) => item.title)).toContain("Project status");
  });

  it("sorts timeline entries by timestamp", () => {
    const items: readonly ReconciliationTimelineItem[] = [
      { event_id: "later", timestamp: "2026-01-01T00:00:02.000Z", phase: "running", title: "Later", summary: "later" },
      { event_id: "earlier", timestamp: "2026-01-01T00:00:01.000Z", phase: "accepted", title: "Earlier", summary: "earlier" },
    ];

    expect(sortTimeline(items).map((item) => item.event_id)).toEqual(["earlier", "later"]);
  });

  it("renders indexed artifact summaries from project output", () => {
    const project = {
      ...projectStatus(),
      output: {
        artifacts: [{
          artifact_id: "research-brief-1",
          kind: "research_brief",
          title: "Research brief",
          summary: "Fixture brief",
          path_or_uri: ".open-lagrange/demos/research-brief.json",
          created_at: updatedAt,
          redacted: true,
          exportable: true,
        }],
      },
    } as unknown as ProjectRunStatus;

    const view = buildViewModel({
      project,
      selectedPane: "artifact_json",
      inputMode: "chat",
      isLoading: false,
    });

    expect(view.artifacts.find((artifact) => artifact.artifact_id === "research-brief-1")?.artifact_type).toBe("research_brief");
  });
});
