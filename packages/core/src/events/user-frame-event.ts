import { z } from "zod";
import { ExecutionMode } from "../runtime/execution-mode.js";

export const TuiUserFrameEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chat.message"), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal("chat.help") }).strict(),
  z.object({ type: z.literal("capability.list") }).strict(),
  z.object({ type: z.literal("intent.classify"), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan.compose"), prompt: z.string().min(1), repo_path: z.string().optional(), provider_id: z.string().min(1).optional(), write: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("plan_builder.start"), prompt: z.string().min(1), repo_path: z.string().optional(), provider_id: z.string().min(1).optional() }).strict(),
  z.object({ type: z.literal("plan_builder.status"), session_id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan_builder.answer"), session_id: z.string().min(1).optional(), question_id: z.string().min(1), answer: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan_builder.accept_defaults"), session_id: z.string().min(1).optional() }).strict(),
  z.object({ type: z.literal("plan_builder.validate"), session_id: z.string().min(1).optional() }).strict(),
  z.object({ type: z.literal("plan_builder.save"), session_id: z.string().min(1).optional(), output_path: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan_builder.run"), session_id: z.string().min(1).optional(), live: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("plan_builder.schedule"), session_id: z.string().min(1).optional(), cadence: z.enum(["daily", "weekly", "cron"]).default("daily"), time_of_day: z.string().min(1).optional() }).strict(),
  z.object({ type: z.literal("plan_builder.edit"), session_id: z.string().min(1).optional(), preferred_surface: z.enum(["web", "local_file"]).optional() }).strict(),
  z.object({ type: z.literal("plan_builder.update_planfile"), session_id: z.string().min(1).optional(), path: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan_builder.import_planfile"), path: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan_builder.reconcile_planfile"), path: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan_builder.diff_planfiles"), old_path: z.string().min(1), new_path: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan.create"), goal: z.string().min(1), target: z.enum(["generic", "repo"]).default("generic"), repo_path: z.string().optional(), dry_run: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal("plan.check"), planfile: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan.library") }).strict(),
  z.object({ type: z.literal("plan.apply"), planfile: z.string().min(1) }).strict(),
  z.object({ type: z.literal("repo.run"), goal: z.string().min(1), repo_path: z.string().default("."), dry_run: z.boolean().default(true), apply: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("skill.frame"), file: z.string().min(1) }).strict(),
  z.object({ type: z.literal("skill.plan"), file: z.string().min(1) }).strict(),
  z.object({ type: z.literal("pack.build"), file: z.string().min(1), dry_run: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal("pack.list") }).strict(),
  z.object({ type: z.literal("pack.inspect"), pack_id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("demo.list") }).strict(),
  z.object({ type: z.literal("demo.run"), demo_id: z.string().min(1), dry_run: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal("run.show"), run_id: z.string().min(1).default("latest"), outputs_only: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("artifact.show"), artifact_id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("research.providers") }).strict(),
  z.object({ type: z.literal("provider.list") }).strict(),
  z.object({ type: z.literal("schedule.list") }).strict(),
  z.object({ type: z.literal("research.search"), query: z.string().min(1), mode: ExecutionMode.default("live"), provider_id: z.string().min(1).optional(), dry_run: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("research.fetch"), url: z.string().min(1), mode: ExecutionMode.default("live"), dry_run: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("research.summarize_url"), url: z.string().min(1), mode: ExecutionMode.default("live"), dry_run: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("research.brief"), topic: z.string().min(1), mode: ExecutionMode.default("live"), provider_id: z.string().min(1).optional(), urls: z.array(z.string().min(1)).default([]), dry_run: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("research.export"), brief_id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("approval.approve"), approval_id: z.string().min(1), task_id: z.string().optional(), reason: z.string().default("Approved from TUI.") }).strict(),
  z.object({ type: z.literal("approval.reject"), approval_id: z.string().min(1), task_id: z.string().optional(), reason: z.string().default("Rejected from TUI.") }).strict(),
  z.object({ type: z.literal("doctor.run") }).strict(),
  z.object({ type: z.literal("status.show") }).strict(),
]);

export type TuiUserFrameEvent = z.infer<typeof TuiUserFrameEvent>;

export type FlowId =
  | "help"
  | "status"
  | "doctor"
  | "capabilities"
  | "packs"
  | "demos"
  | "plan_compose"
  | "plan_builder"
  | "plan_check"
  | "plan_library"
  | "repository_plan"
  | "repository_run"
  | "skill_frame"
  | "skill_plan"
  | "pack_build"
  | "pack_inspect"
  | "demo_run"
  | "run_show"
  | "artifact_show"
  | "research_search"
  | "research_providers"
  | "research_fetch"
  | "research_summarize_url"
  | "research_brief"
  | "research_export"
  | "provider_list"
  | "schedule_list"
  | "approval";

export const WorkflowStartingEventTypes = new Set<TuiUserFrameEvent["type"]>([
  "plan.create",
  "plan.compose",
  "plan_builder.start",
  "plan_builder.answer",
  "plan_builder.accept_defaults",
  "plan_builder.validate",
  "plan_builder.save",
  "plan_builder.run",
  "plan_builder.schedule",
  "plan_builder.edit",
  "plan_builder.update_planfile",
  "plan_builder.import_planfile",
  "plan_builder.reconcile_planfile",
  "plan_builder.diff_planfiles",
  "plan.apply",
  "repo.run",
  "skill.frame",
  "skill.plan",
  "pack.build",
  "demo.run",
  "research.search",
  "research.fetch",
  "research.summarize_url",
  "research.brief",
  "research.export",
  "approval.approve",
  "approval.reject",
]);

export function eventStartsWorkflow(event: TuiUserFrameEvent): boolean {
  return WorkflowStartingEventTypes.has(event.type);
}
