import type { SuggestedFlow, TuiUserFrameEvent, UserFrameEvent } from "@open-lagrange/core/interface";
import { flowForDemoRun, flowForPackBuild, flowForPlanCompose, flowForRepositoryPlan, flowForRepositoryRun, flowForSkillPlan } from "@open-lagrange/core/interface";
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
  if (command === "compose" && text) return { kind: "event", command, pane: "chat", event: { type: "plan.compose", prompt: text, write: false, ...(context.repo_path ? { repo_path: context.repo_path } : {}) } };
  if (command === "builder") {
    const [subcommand, ...valueParts] = rest;
    const value = valueParts.join(" ").trim();
    if (subcommand === "start" && value) return { kind: "event", command, pane: "chat", event: { type: "plan_builder.start", prompt: value, ...(context.repo_path ? { repo_path: context.repo_path } : {}) } };
    if (subcommand === "status") return { kind: "event", command, pane: "chat", event: { type: "plan_builder.status", session_id: value || "latest" } };
    return { kind: "error", command, error: "Usage: /builder start <goal> or /builder status <session_id>" };
  }
  if (command === "answer") {
    const [questionId, ...answerParts] = rest;
    if (questionId && answerParts.length > 0) return { kind: "event", command, pane: "chat", event: { type: "plan_builder.answer", question_id: questionId, answer: answerParts.join(" ") } };
    return { kind: "error", command, error: "Usage: /answer <question_id> <answer>" };
  }
  if (command === "accept-defaults") return { kind: "event", command, pane: "chat", event: { type: "plan_builder.accept_defaults" } };
  if (command === "revise" && text) return { kind: "event", command, pane: "chat", event: { type: "plan_builder.start", prompt: text, ...(context.repo_path ? { repo_path: context.repo_path } : {}) } };
  if (command === "validate") return { kind: "event", command, pane: "chat", event: { type: "plan_builder.validate" } };
  if (command === "save" && text) return { kind: "event", command, pane: "chat", event: { type: "plan_builder.save", output_path: text } };
  if (command === "edit-plan") return { kind: "event", command, pane: "chat", event: { type: "plan_builder.edit", preferred_surface: rest.includes("--web") || rest.includes("web") ? "web" : "local_file" } };
  if (command === "update-plan" && text) return { kind: "event", command, pane: "chat", event: { type: "plan_builder.update_planfile", path: text } };
  if (command === "import-plan" && text) return { kind: "event", command, pane: "chat", event: { type: "plan_builder.import_planfile", path: text } };
  if (command === "reconcile" && text) return { kind: "event", command, pane: "chat", event: { type: "plan_builder.reconcile_planfile", path: text } };
  if (command === "plan-diff") {
    const [oldPath, newPath] = rest;
    if (oldPath && newPath) return { kind: "event", command, pane: "chat", event: { type: "plan_builder.diff_planfiles", old_path: oldPath, new_path: newPath } };
    return { kind: "error", command, error: "Usage: /plan-diff <old_planfile> <new_planfile>" };
  }
  if (command === "check" && text) return { kind: "event", command, pane: "chat", event: { type: "plan.check", planfile: text } };
  if (command === "library" || command === "plans") return { kind: "event", command, pane: "plan_library", event: { type: "plan.library" } };
  if (command === "providers") return { kind: "event", command, pane: "chat", event: { type: "provider.list" } };
  if (command === "artifacts") return { kind: "event", command, pane: "chat", event: { type: "artifact.show", artifact_id: "list" } };
  if (command === "schedule") return { kind: "event", command, pane: "chat", event: { type: "schedule.list" } };
  if (command === "capabilities") return { kind: "event", command, pane: "chat", event: { type: "capability.list" } };
  if (command === "packs") return { kind: "event", command, pane: "chat", event: { type: "pack.list" } };
  if (command === "demos") return { kind: "event", command, pane: "chat", event: { type: "demo.list" } };
  if (command === "diff") return context.project_id ? { kind: "event", command, pane: "diff", event: { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type: "diff" } } : { kind: "pane", command, pane: "diff" };
  if (command === "repository") return { kind: "pane", command, pane: "repository" };
  if (command === "output") return { kind: "pane", command, pane: "output" };
  if (command === "review") return context.project_id ? { kind: "event", command, pane: "review", event: { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type: "review" } } : { kind: "pane", command, pane: "review" };
  if (command === "json") return context.project_id ? { kind: "event", command, pane: "artifact_json", event: { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type: "artifact_json" } } : { kind: "pane", command, pane: "artifact_json" };
  if (command === "verify") {
    if (text && context.project_id) return { kind: "event", command, pane: "verification", event: { type: "request_verification", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), command_id: text } };
    return context.project_id ? { kind: "event", command, pane: "verification", event: { type: "request_artifact", project_id: context.project_id, ...(context.task_id ? { task_id: context.task_id } : {}), artifact_type: "verification" } } : { kind: "pane", command, pane: "verification" };
  }
  if (command === "plan") {
    const [target, ...goalParts] = rest;
    if (target === "compose" && goalParts.length > 0) return { kind: "event", command, pane: "chat", event: flowForPlanCompose(goalParts.join(" "), context).event };
    if (target === "check" && goalParts.length > 0) return { kind: "event", command, pane: "chat", event: { type: "plan.check", planfile: goalParts.join(" ") } };
    if (target === "library") return { kind: "event", command, pane: "plan_library", event: { type: "plan.library" } };
    if ((target === "run" || target === "apply") && goalParts.length > 0) return { kind: "event", command, pane: "run", event: { type: "plan.apply", planfile: goalParts.join(" ") } };
    if (target === "repo" && goalParts.length > 0) return { kind: "event", command, pane: "chat", event: flowForRepositoryPlan(goalParts.join(" "), context).event };
    if (text) return { kind: "event", command, pane: "chat", event: { type: "plan.create", target: "generic", goal: text, dry_run: true } };
    return { kind: "error", command, error: "Usage: /plan repo <goal>" };
  }
  if (command === "repo") {
    const [subcommand, ...goalParts] = rest;
    if (subcommand === "run" && goalParts.length > 0) return { kind: "event", command, pane: "repository", event: flowForRepositoryRun(goalParts.join(" "), context).event };
    if (subcommand === "status" || subcommand === "explain" || subcommand === "diff" || subcommand === "evidence" || subcommand === "verify") return { kind: "pane", command, pane: "repository" };
    return { kind: "error", command, error: "Usage: /repo run <goal>, /repo status, /repo explain, /repo diff, /repo evidence, or /repo verify" };
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
    if (subcommand === "providers") return { kind: "event", command, pane: "research", event: { type: "research.providers" } };
    const fixture = rest.includes("--fixture") || rest.includes("fixture");
    const dryRun = rest.includes("--dry-run");
    const mode = dryRun ? "dry_run" : fixture ? "fixture" : "live";
    const urls = valuesForFlag(valueParts, "--url");
    const providerId = valuesForFlag(valueParts, "--provider")[0];
    const value = valueParts.filter((part, index) =>
      part !== "--live" && part !== "--fixture" && part !== "--dry-run" && part !== "live" && part !== "fixture" && part !== "--url" && part !== "--provider" && valueParts[index - 1] !== "--url" && valueParts[index - 1] !== "--provider"
    ).join(" ").trim();
    if (subcommand === "search" && value) return { kind: "event", command, pane: "research", event: { type: "research.search", query: value, mode, ...(providerId ? { provider_id: providerId } : {}), dry_run: dryRun } };
    if (subcommand === "brief" && value) return { kind: "event", command, pane: "research", event: { type: "research.brief", topic: value, mode, ...(providerId ? { provider_id: providerId } : {}), urls, dry_run: dryRun } };
    if ((subcommand === "summarize-url" || subcommand === "summarize_url") && value) return { kind: "event", command, pane: "research", event: { type: "research.summarize_url", url: value, mode, dry_run: dryRun } };
    if (subcommand === "fetch" && value) return { kind: "event", command, pane: "research", event: { type: "research.fetch", url: value, mode, dry_run: dryRun } };
    if (subcommand === "export" && value) return { kind: "event", command, pane: "research", event: { type: "research.export", brief_id: value } };
    return { kind: "error", command, error: "Usage: /research providers, /research search <query>, /research brief <topic> [--url <url>] [--fixture], /research fetch <url>, /research summarize-url <url>, or /research export <brief_id>" };
  }
  if (command === "run") {
    const [subcommand, value] = rest;
    if (subcommand === "list") return { kind: "event", command, pane: "chat", event: { type: "run.show", run_id: "list", outputs_only: false } };
    if (subcommand === "show") return { kind: "event", command, pane: "chat", event: { type: "run.show", run_id: value ?? "latest", outputs_only: false } };
    if (subcommand === "outputs") return { kind: "event", command, pane: "chat", event: { type: "run.show", run_id: value ?? "latest", outputs_only: true } };
    if (subcommand === "status" || subcommand === "events" || subcommand === "explain" || subcommand === "artifacts") return { kind: "event", command, pane: "run", event: { type: "run.show", run_id: value ?? "latest", outputs_only: subcommand === "artifacts" } };
    if (subcommand === "resume" && value) return { kind: "event", command, pane: "run", event: { type: "run.resume", run_id: value } };
    if (subcommand === "retry" && value && rest[2]) {
      const modeIndex = rest.findIndex((part) => part === "--mode");
      const replay_mode = modeIndex >= 0 ? rest[modeIndex + 1] : undefined;
      if (replay_mode === "reuse-artifacts" || replay_mode === "refresh-artifacts" || replay_mode === "force-new-idempotency-key") return { kind: "event", command, pane: "run", event: { type: "run.retry", run_id: value, node_id: rest[2], replay_mode } };
      return { kind: "error", command, error: "Usage: /run retry <run_id> <node_id> --mode reuse-artifacts|refresh-artifacts|force-new-idempotency-key" };
    }
    return { kind: "error", command, error: "Usage: /run list, /run show <run_id|latest>, /run status <run_id>, /run events <run_id>, /run explain <run_id>, /run artifacts <run_id>, /run resume <run_id>, /run retry <run_id> <node_id> --mode <mode>, or /run outputs <run_id|latest>" };
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

function valuesForFlag(parts: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < parts.length - 1; index += 1) {
    const value = parts[index + 1];
    if (parts[index] === flag && value) values.push(value);
  }
  return values;
}
