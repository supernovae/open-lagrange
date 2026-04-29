import type { UserFrameEvent } from "@open-lagrange/core/interface";
import type { PaneId, ParsedInput } from "./types.js";

export interface ParseContext {
  readonly project_id?: string;
  readonly task_id?: string;
  readonly approval_request_id?: string;
  readonly repo_path?: string;
  readonly workspace_id?: string;
  readonly dry_run?: boolean;
}

export function parseUserInput(text: string, context: ParseContext): ParsedInput {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "empty" };
  if (trimmed.startsWith("/")) return parseCommand(trimmed, context);
  if (!context.project_id) {
    return { kind: "event", event: submitGoal(trimmed, context) };
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("why") || lower.startsWith("explain") || lower.startsWith("what")) {
    return { kind: "event", event: { type: "ask_explanation", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), text: trimmed } };
  }
  return { kind: "event", event: { type: "refine_goal", project_id: context.project_id, text: trimmed } };
}

function parseCommand(input: string, context: ParseContext): ParsedInput {
  const [command = "", ...rest] = input.slice(1).split(/\s+/);
  const text = rest.join(" ").trim();
  if (command === "quit") return { kind: "command", command, quit: true };
  if (command === "help") return { kind: "command", command, pane: "help" };
  if (command === "status") return { kind: "command", command, pane: "timeline" };
  if (command === "plan") return commandWithArtifact(command, "plan", context, "plan");
  if (command === "diff") return commandWithArtifact(command, "diff", context, "diff");
  if (command === "verify") {
    if (text && context.project_id) {
      return {
        kind: "command",
        command,
        pane: "verification",
        event: {
          type: "request_verification",
          project_id: context.project_id,
          ...(context.task_id ? { task_id: context.task_id } : {}),
          command_id: text,
        },
      };
    }
    return commandWithArtifact(command, "verification", context, "verification");
  }
  if (command === "review") return commandWithArtifact(command, "review", context, "review");
  if (command === "json") return commandWithArtifact(command, "artifact_json", context, "artifact_json");
  if (command === "demo") return { kind: "command", command, pane: "demo" };
  if (command === "pack") return { kind: "command", command, pane: "pack_builder" };
  if (command === "approve") return withProject(context, { kind: "command", command, event: { type: "approve", approval_request_id: context.approval_request_id ?? context.task_id ?? "", task_id: context.task_id ?? "", reason: text || "Approved from TUI." } });
  if (command === "reject") return withProject(context, { kind: "command", command, event: { type: "reject", approval_request_id: context.approval_request_id ?? context.task_id ?? "", task_id: context.task_id ?? "", reason: text || "Rejected from TUI." } });
  if (command === "run") return { kind: "command", command, event: submitGoal(text, context) };
  if (command === "attach") return text ? { kind: "command", command, attachProjectId: text, pane: "timeline" } : { kind: "command", command, error: "Usage: /attach <project_id>" };
  if (command === "profile") return { kind: "command", command, error: "Profile switching is available from the CLI: open-lagrange profile use <name>." };
  if (command === "scope") {
    if (!context.project_id) return { kind: "command", command, error: "No project is active." };
    const [mode, ...paths] = rest;
    if (mode === "allow") return { kind: "command", command, event: { type: "adjust_scope", project_id: context.project_id, allowed_paths: paths, reason: "Scope adjusted from TUI." } };
    if (mode === "deny") return { kind: "command", command, event: { type: "adjust_scope", project_id: context.project_id, denied_paths: paths, reason: "Scope adjusted from TUI." } };
  }
  return { kind: "command", command, error: `Unknown command: /${command}` };
}

function submitGoal(text: string, context: ParseContext): UserFrameEvent {
  return {
    type: "submit_goal",
    text,
    ...(context.repo_path ? { repo_path: context.repo_path } : {}),
    ...(context.workspace_id ? { workspace_id: context.workspace_id } : {}),
    ...(context.dry_run === undefined ? {} : { dry_run: context.dry_run }),
  };
}

function artifact(context: ParseContext, artifact_type: "diff" | "review" | "verification" | "plan" | "artifact_json"): UserFrameEvent | undefined {
  if (!context.project_id) return undefined;
  return { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type };
}

function commandWithArtifact(command: string, pane: PaneId, context: ParseContext, artifact_type: "diff" | "review" | "verification" | "plan" | "artifact_json"): ParsedInput {
  const event = artifact(context, artifact_type);
  return event ? { kind: "command", command, pane, event } : { kind: "command", command, pane };
}

function withProject(context: ParseContext, parsed: ParsedInput): ParsedInput {
  if (!context.project_id || !context.task_id) return { kind: "command", command: "approval", error: "No approval-capable task is selected." };
  return parsed;
}
