import { z } from "zod";

export const TuiUserFrameEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chat.message"), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal("intent.classify"), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan.create"), goal: z.string().min(1), target: z.enum(["generic", "repo"]).default("generic"), repo_path: z.string().optional(), dry_run: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal("plan.apply"), planfile: z.string().min(1) }).strict(),
  z.object({ type: z.literal("repo.run"), goal: z.string().min(1), repo_path: z.string().default("."), dry_run: z.boolean().default(true), apply: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("skill.frame"), file: z.string().min(1) }).strict(),
  z.object({ type: z.literal("skill.plan"), file: z.string().min(1) }).strict(),
  z.object({ type: z.literal("pack.build"), file: z.string().min(1), dry_run: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal("pack.inspect"), pack_id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("demo.run"), demo_id: z.string().min(1), dry_run: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal("artifact.show"), artifact_id: z.string().min(1) }).strict(),
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
  | "repository_plan"
  | "repository_run"
  | "skill_frame"
  | "skill_plan"
  | "pack_build"
  | "pack_inspect"
  | "demo_run"
  | "artifact_show"
  | "approval";

export const WorkflowStartingEventTypes = new Set<TuiUserFrameEvent["type"]>([
  "plan.create",
  "plan.apply",
  "repo.run",
  "skill.frame",
  "skill.plan",
  "pack.build",
  "demo.run",
  "approval.approve",
  "approval.reject",
]);

export function eventStartsWorkflow(event: TuiUserFrameEvent): boolean {
  return WorkflowStartingEventTypes.has(event.type);
}
