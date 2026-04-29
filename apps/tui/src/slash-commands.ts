import type { SuggestedFlow, TuiUserFrameEvent, UserFrameEvent } from "@open-lagrange/core/interface";
import { flowForDemoRun, flowForPackBuild, flowForRepositoryPlan, flowForRepositoryRun, flowForSkillPlan } from "@open-lagrange/core/interface";
import type { PaneId } from "./types.js";

export interface SlashCommandContext {
  readonly project_id?: string;
  readonly task_id?: string;
  readonly approval_request_id?: string;
  readonly repo_path?: string;
  readonly pendingFlow?: SuggestedFlow;
}

export type SlashCommandResult =
  | { readonly kind: "pane"; readonly command: string; readonly pane: PaneId }
  | { readonly kind: "event"; readonly command: string; readonly event: TuiUserFrameEvent | UserFrameEvent; readonly pane?: PaneId }
  | { readonly kind: "confirm"; readonly command: string; readonly event: TuiUserFrameEvent | UserFrameEvent; readonly flow: SuggestedFlow }
  | { readonly kind: "quit"; readonly command: string }
  | { readonly kind: "error"; readonly command: string; readonly error: string };

export function parseSlashCommand(input: string, context: SlashCommandContext = {}): SlashCommandResult {
  const [command = "", ...rest] = input.slice(1).trim().split(/\s+/);
  const text = rest.join(" ").trim();
  if (command === "quit") return { kind: "quit", command };
  if (command === "attach") return { kind: "error", command, error: "Use the startup --project-id option to attach to a project." };
  if (command === "confirm") {
    if (!context.pendingFlow) return { kind: "error", command, error: "No suggested flow is waiting for confirmation." };
    return { kind: "confirm", command, flow: context.pendingFlow, event: context.pendingFlow.event };
  }
  if (command === "help") return { kind: "event", command, pane: "chat", event: { type: "chat.help" } };
  if (command === "status") return { kind: "event", command, pane: "chat", event: { type: "status.show" } };
  if (command === "doctor") return { kind: "event", command, pane: "chat", event: { type: "doctor.run" } };
  if (command === "capabilities") return { kind: "event", command, pane: "chat", event: { type: "capability.list" } };
  if (command === "packs") return { kind: "event", command, pane: "chat", event: { type: "pack.list" } };
  if (command === "demos") return { kind: "event", command, pane: "chat", event: { type: "demo.list" } };
  if (command === "diff") return context.project_id ? { kind: "event", command, pane: "diff", event: { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type: "diff" } } : { kind: "pane", command, pane: "diff" };
  if (command === "review") return context.project_id ? { kind: "event", command, pane: "review", event: { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type: "review" } } : { kind: "pane", command, pane: "review" };
  if (command === "json") return context.project_id ? { kind: "event", command, pane: "artifact_json", event: { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type: "artifact_json" } } : { kind: "pane", command, pane: "artifact_json" };
  if (command === "verify") {
    if (text && context.project_id) return { kind: "event", command, pane: "verification", event: { type: "request_verification", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), command_id: text } };
    return context.project_id ? { kind: "event", command, pane: "verification", event: { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type: "verification" } } : { kind: "pane", command, pane: "verification" };
  }
  if (command === "plan") {
    const [target, ...goalParts] = rest;
    if (target === "repo" && goalParts.length > 0) return { kind: "event", command, pane: "chat", event: flowForRepositoryPlan(goalParts.join(" "), context).event };
    if (text) return { kind: "event", command, pane: "chat", event: { type: "plan.create", target: "generic", goal: text, dry_run: true } };
    return { kind: "error", command, error: "Usage: /plan repo <goal>" };
  }
  if (command === "repo") {
    const [subcommand, ...goalParts] = rest;
    if (subcommand === "run" && goalParts.length > 0) return { kind: "event", command, pane: "chat", event: flowForRepositoryRun(goalParts.join(" "), context).event };
    return { kind: "error", command, error: "Usage: /repo run <goal>" };
  }
  if (command === "skill") {
    const [subcommand, file] = rest;
    if (subcommand === "frame" && file) return { kind: "event", command, pane: "chat", event: { type: "skill.frame", file } };
    if (subcommand === "plan" && file) return { kind: "event", command, pane: "chat", event: flowForSkillPlan(file).event };
    return { kind: "error", command, error: "Usage: /skill frame <file> or /skill plan <file>" };
  }
  if (command === "pack") {
    const [subcommand, value] = rest;
    if (subcommand === "build" && value) return { kind: "event", command, pane: "chat", event: flowForPackBuild(value).event };
    if (subcommand === "inspect" && value) return { kind: "event", command, pane: "chat", event: { type: "pack.inspect", pack_id: value } };
    return { kind: "event", command, pane: "chat", event: { type: "pack.list" } };
  }
  if (command === "demo") {
    const [subcommand, value] = rest;
    if (subcommand === "run" && value) {
      const live = rest.includes("--live") || rest.includes("live");
      return { kind: "event", command, pane: "chat", event: { type: "demo.run", demo_id: value, dry_run: !live } };
    }
    return { kind: "event", command, pane: "chat", event: { type: "demo.list" } };
  }
  if (command === "research") {
    const [subcommand, ...valueParts] = rest;
    const live = rest.includes("--live") || rest.includes("live");
    const value = valueParts.filter((part) => part !== "--live" && part !== "--fixture" && part !== "live" && part !== "fixture").join(" ").trim();
    if (subcommand === "search" && value) return { kind: "event", command, pane: "research", event: { type: "research.search", query: value, mode: live ? "live" : "fixture" } };
    if (subcommand === "brief" && value) return { kind: "event", command, pane: "research", event: { type: "research.brief", topic: value, mode: live ? "live" : "fixture" } };
    if (subcommand === "fetch" && value) return { kind: "event", command, pane: "research", event: { type: "research.fetch", url: value, mode: live ? "live" : "fixture" } };
    if (subcommand === "export" && value) return { kind: "event", command, pane: "research", event: { type: "research.export", brief_id: value } };
    return { kind: "error", command, error: "Usage: /research search <query>, /research brief <topic>, /research fetch <url> --live, or /research export <brief_id>" };
  }
  if (command === "run") {
    const [subcommand, value] = rest;
    if (subcommand === "list") return { kind: "event", command, pane: "chat", event: { type: "run.show", run_id: "list", outputs_only: false } };
    if (subcommand === "show") return { kind: "event", command, pane: "chat", event: { type: "run.show", run_id: value ?? "latest", outputs_only: false } };
    if (subcommand === "outputs") return { kind: "event", command, pane: "chat", event: { type: "run.show", run_id: value ?? "latest", outputs_only: true } };
    return { kind: "error", command, error: "Usage: /run list, /run show <run_id|latest>, or /run outputs <run_id|latest>" };
  }
  if (command === "artifact") {
    const [subcommand, value] = rest;
    if (subcommand === "list") return { kind: "event", command, pane: "chat", event: { type: "artifact.show", artifact_id: "list" } };
    if (subcommand === "recent") return { kind: "event", command, pane: "chat", event: { type: "artifact.show", artifact_id: "recent" } };
    if (subcommand === "show" && value) return { kind: "event", command, pane: "chat", event: { type: "artifact.show", artifact_id: value } };
    return { kind: "error", command, error: "Usage: /artifact list, /artifact recent, or /artifact show <artifact_id>" };
  }
  if (command === "approve") {
    const approvalId = rest[0] && !rest[0].startsWith("-") ? rest[0] : context.approval_request_id;
    if (!approvalId) return { kind: "error", command, error: "Usage: /approve <approval_id>" };
    return { kind: "event", command, pane: "approvals", event: { type: "approval.approve", approval_id: approvalId, ...(context.task_id ? { task_id: context.task_id } : {}), reason: rest.slice(1).join(" ") || "Approved from TUI." } };
  }
  if (command === "reject") {
    const approvalId = rest[0] && !rest[0].startsWith("-") ? rest[0] : context.approval_request_id;
    if (!approvalId) return { kind: "error", command, error: "Usage: /reject <approval_id>" };
    return { kind: "event", command, pane: "approvals", event: { type: "approval.reject", approval_id: approvalId, ...(context.task_id ? { task_id: context.task_id } : {}), reason: rest.slice(1).join(" ") || "Rejected from TUI." } };
  }
  return { kind: "error", command, error: `Unknown command: /${command}` };
}
