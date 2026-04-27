import { describe, expect, it } from "vitest";
import { parseUserInput } from "./command-parser.js";

describe("TUI input parsing", () => {
  it("maps plain text without an active project to a submit_goal event", () => {
    const parsed = parseUserInput("Add JSON output to status", {
      repo_path: ".",
      workspace_id: "workspace-local",
      dry_run: true,
    });

    expect(parsed.kind).toBe("event");
    if (parsed.kind !== "event") return;
    expect(parsed.event).toMatchObject({
      type: "submit_goal",
      text: "Add JSON output to status",
      repo_path: ".",
      workspace_id: "workspace-local",
      dry_run: true,
    });
  });

  it("maps explanation text during a project to ask_explanation", () => {
    const parsed = parseUserInput("why did this need approval?", {
      project_id: "project-1",
      task_id: "task-run-1",
    });

    expect(parsed.kind).toBe("event");
    if (parsed.kind !== "event") return;
    expect(parsed.event).toMatchObject({
      type: "ask_explanation",
      project_id: "project-1",
      task_id: "task-run-1",
    });
  });

  it("maps refinement text during a project to refine_goal", () => {
    const parsed = parseUserInput("Only update apps/cli", {
      project_id: "project-1",
    });

    expect(parsed.kind).toBe("event");
    if (parsed.kind !== "event") return;
    expect(parsed.event).toMatchObject({
      type: "refine_goal",
      project_id: "project-1",
      text: "Only update apps/cli",
    });
  });

  it("maps approval commands to approval events", () => {
    const parsed = parseUserInput("/approve Looks bounded", {
      project_id: "project-1",
      task_id: "task-run-1",
      approval_request_id: "approval-1",
    });

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.event).toMatchObject({
      type: "approve",
      approval_request_id: "approval-1",
      task_id: "task-run-1",
      reason: "Looks bounded",
    });
  });

  it("maps artifact commands to pane and request_artifact event", () => {
    const parsed = parseUserInput("/diff", {
      project_id: "project-1",
      task_id: "task-run-1",
    });

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("diff");
    expect(parsed.event).toMatchObject({
      type: "request_artifact",
      project_id: "project-1",
      task_id: "task-run-1",
      artifact_type: "diff",
    });
  });

  it("maps verification command IDs to request_verification events", () => {
    const parsed = parseUserInput("/verify npm_run_typecheck", {
      project_id: "project-1",
      task_id: "task-run-1",
    });

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("verification");
    expect(parsed.event).toMatchObject({
      type: "request_verification",
      project_id: "project-1",
      task_id: "task-run-1",
      command_id: "npm_run_typecheck",
    });
  });

  it("maps attach to a local pane command", () => {
    const parsed = parseUserInput("/attach project-2", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.attachProjectId).toBe("project-2");
    expect(parsed.event).toBeUndefined();
  });
});
