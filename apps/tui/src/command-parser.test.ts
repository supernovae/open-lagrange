import { describe, expect, it } from "vitest";
import { parseUserInput } from "./command-parser.js";

describe("TUI input parsing", () => {
  it("maps plain text without an active project to a suggested flow", () => {
    const parsed = parseUserInput("Add JSON output to status", {
      repo_path: ".",
      workspace_id: "workspace-local",
      dry_run: true,
    });

    expect(parsed.kind).toBe("suggestion");
    if (parsed.kind !== "suggestion") return;
    expect(parsed.flow.event).toMatchObject({
      type: "plan.create",
      target: "repo",
      goal: "Add JSON output to status",
      repo_path: ".",
      dry_run: true,
    });
  });

  it("maps explanation text during a project to a read-only chat event", () => {
    const parsed = parseUserInput("why did this need approval?", {
      project_id: "project-1",
      task_id: "task-run-1",
    });

    expect(parsed.kind).toBe("event");
    if (parsed.kind !== "event") return;
    expect(parsed.event).toMatchObject({ type: "chat.message" });
  });

  it("maps ambiguous text to multiple suggestions", () => {
    const parsed = parseUserInput("hello there", {
      project_id: "project-1",
    });

    expect(parsed.kind).toBe("suggestions");
    if (parsed.kind !== "suggestions") return;
    expect(parsed.flows.length).toBeGreaterThan(0);
  });

  it("maps approval commands to approval events", () => {
    const parsed = parseUserInput("/approve approval-1 Looks bounded", {
      project_id: "project-1",
      task_id: "task-run-1",
      approval_request_id: "approval-1",
    });

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.event).toMatchObject({
      type: "approval.approve",
      approval_id: "approval-1",
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

  it("reports attach as a guided startup option", () => {
    const parsed = parseUserInput("/attach project-2", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.error).toContain("--project-id");
    expect(parsed.event).toBeUndefined();
  });

  it("maps pack to the pack builder pane", () => {
    const parsed = parseUserInput("/pack", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("chat");
    expect(parsed.event).toMatchObject({ type: "pack.list" });
  });

  it("maps help to a journaled chat help event", () => {
    const parsed = parseUserInput("/help", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("chat");
    expect(parsed.event).toMatchObject({ type: "chat.help" });
  });

  it("maps packs, demos, and capabilities to journaled discovery events", () => {
    const packs = parseUserInput("/packs", {});
    const demos = parseUserInput("/demos", {});
    const capabilities = parseUserInput("/capabilities", {});

    expect(packs.kind).toBe("command");
    expect(demos.kind).toBe("command");
    expect(capabilities.kind).toBe("command");
    if (packs.kind !== "command" || demos.kind !== "command" || capabilities.kind !== "command") return;
    expect(packs.pane).toBe("chat");
    expect(demos.pane).toBe("chat");
    expect(capabilities.pane).toBe("chat");
    expect(packs.event).toMatchObject({ type: "pack.list" });
    expect(demos.event).toMatchObject({ type: "demo.list" });
    expect(capabilities.event).toMatchObject({ type: "capability.list" });
  });

  it("maps natural language skills file requests to pack build suggestions", () => {
    const parsed = parseUserInput("build a pack from skills.md", {});

    expect(parsed.kind).toBe("suggestion");
    if (parsed.kind !== "suggestion") return;
    expect(parsed.flow.event).toMatchObject({ type: "pack.build", file: "skills.md" });
  });

  it("maps confirm to the pending suggested event", () => {
    const suggested = parseUserInput("add json output to my cli", {});
    if (suggested.kind !== "suggestion") throw new Error("missing suggestion");
    const parsed = parseUserInput("/confirm", { pendingFlow: suggested.flow });

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.event).toMatchObject({ type: "plan.create" });
  });

  it("maps demo run to the demo pane with dry-run by default", () => {
    const parsed = parseUserInput("/demo run repo-json-output", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("chat");
    expect(parsed.event).toMatchObject({
      type: "demo.run",
      demo_id: "repo-json-output",
      dry_run: true,
    });
  });

  it("maps live demo run when requested explicitly", () => {
    const parsed = parseUserInput("/demo run repo-json-output --live", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("chat");
    expect(parsed.event).toMatchObject({
      type: "demo.run",
      demo_id: "repo-json-output",
      dry_run: false,
    });
  });

  it("maps artifact list to the local artifact index event", () => {
    const parsed = parseUserInput("/artifact list", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("chat");
    expect(parsed.event).toMatchObject({
      type: "artifact.show",
      artifact_id: "list",
    });
  });

  it("maps artifact recent to high-signal artifact lookup", () => {
    const parsed = parseUserInput("/artifact recent", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("chat");
    expect(parsed.event).toMatchObject({
      type: "artifact.show",
      artifact_id: "recent",
    });
  });

  it("maps artifact show to the requested artifact", () => {
    const parsed = parseUserInput("/artifact show planfile_123", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("chat");
    expect(parsed.event).toMatchObject({
      type: "artifact.show",
      artifact_id: "planfile_123",
    });
  });

  it("maps run outputs to the latest run outputs", () => {
    const parsed = parseUserInput("/run outputs latest", {});

    expect(parsed.kind).toBe("command");
    if (parsed.kind !== "command") return;
    expect(parsed.pane).toBe("chat");
    expect(parsed.event).toMatchObject({
      type: "run.show",
      run_id: "latest",
      outputs_only: true,
    });
  });
});
