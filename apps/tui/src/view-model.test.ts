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
          artifact_id: "pack-validation-1",
          kind: "pack_validation_report",
          title: "Pack validation",
          summary: "pass",
          path_or_uri: ".open-lagrange/generated-packs/local.example/artifacts/validation-report.json",
          created_at: updatedAt,
          redacted: true,
          exportable: true,
        }, {
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
    expect(view.artifacts.find((artifact) => artifact.artifact_id === "pack-validation-1")?.artifact_type).toBe("pack_validation_report");
  });

  it("renders live research plan execution status", () => {
    const project = {
      project_id: "project-1",
      project_run_id: "project-run-1",
      task_statuses: [],
      output: {
        plan_execution: {
          plan_id: "plan_research_url_summary",
          status: "completed",
          current_node: "export_markdown",
          current_capability: "research.export_markdown",
          policy_result: "allow",
          final_markdown_artifact: "research_markdown_1",
          nodes: [
            { node_id: "fetch_source", status: "completed", capability: "research.fetch_source" },
            { node_id: "extract_content", status: "completed", capability: "research.extract_content" },
            { node_id: "export_markdown", status: "completed", capability: "research.export_markdown" },
          ],
          artifact_refs: ["source_snapshot_1", "source_text_1", "research_markdown_1"],
          warnings: [],
          errors: [],
        },
      },
    } as unknown as ProjectRunStatus;

    const view = buildViewModel({
      project,
      selectedPane: "plan",
      inputMode: "chat",
      isLoading: false,
    });

    expect(view.plan?.current_capability).toBe("research.export_markdown");
    expect(view.plan?.policy_result).toBe("allow");
    expect(view.plan?.artifact_refs).toContain("research_markdown_1");
    expect(view.plan?.dag_lines).toContain("fetch_source: completed (research.fetch_source)");
  });

  it("renders repository plan status from durable output", () => {
    const project = {
      project_id: "project-1",
      project_run_id: "project-run-1",
      task_statuses: [],
      output: {
        repository_plan_status: {
          plan_id: "repo_plan_1",
          status: "completed",
          current_node: "review_repo",
          worktree_session: { worktree_path: ".open-lagrange/worktrees/repo_plan_1" },
          changed_files: ["README.md"],
          evidence_bundle_ids: ["evidence_1"],
          patch_artifact_ids: ["patch_artifact_1"],
          verification_report_ids: ["verification_1"],
          repair_attempt_ids: [],
          final_patch_artifact_id: "final_patch_1",
          artifact_refs: ["evidence_1", "patch_artifact_1", "verification_1", "final_patch_1"],
          warnings: [],
          errors: [],
        },
      },
    } as unknown as ProjectRunStatus;

    const view = buildViewModel({
      project,
      selectedPane: "plan",
      inputMode: "chat",
      isLoading: false,
    });

    expect(view.plan?.worktree_path).toContain("worktrees/repo_plan_1");
    expect(view.plan?.changed_files).toEqual(["README.md"]);
    expect(view.plan?.evidence_bundles).toEqual(["evidence_1"]);
    expect(view.plan?.patch_artifacts).toEqual(["patch_artifact_1"]);
    expect(view.plan?.verification_reports).toEqual(["verification_1"]);
    expect(view.plan?.final_patch_artifact).toBe("final_patch_1");
  });
});
