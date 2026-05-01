import { z } from "zod";
import { RiskLevel } from "../schemas/capabilities.js";

export const IntentDomain = z.enum(["repository", "research", "skill", "pack", "notes", "files", "generic"]);
export const IntentAction = z.enum(["create_plan", "run_workflow", "create_brief", "patch_repository", "build_pack", "summarize", "schedule", "unknown"]);
export const IntentOutputKind = z.enum(["markdown_brief", "git_patch", "review_report", "planfile", "artifact", "unknown"]);
export const IntentOutputFormat = z.enum(["markdown", "json", "patch", "text"]);
export const IntentCadence = z.enum(["manual", "daily", "weekly", "cron"]);
export const SideEffectExpectation = z.enum(["none", "artifact_write", "workspace_write", "external_write", "unknown"]);

export const IntentFrame = z.object({
  intent_id: z.string().min(1),
  original_prompt: z.string().min(1),
  interpreted_goal: z.string().min(1),
  domain: IntentDomain,
  action: IntentAction,
  output_expectation: z.object({
    kind: IntentOutputKind,
    format: IntentOutputFormat.optional(),
  }).strict().optional(),
  schedule_intent: z.object({
    requested: z.boolean(),
    cadence: IntentCadence.optional(),
    time_of_day: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
  }).strict().optional(),
  constraints: z.array(z.string()),
  non_goals: z.array(z.string()),
  assumptions: z.array(z.string()),
  ambiguity: z.object({
    level: z.enum(["low", "medium", "high"]),
    questions: z.array(z.string().min(1)),
    blocking: z.boolean(),
  }).strict(),
  required_capability_kinds: z.array(z.string().min(1)),
  side_effect_expectation: SideEffectExpectation,
  risk_level: RiskLevel,
}).strict();

export type IntentDomain = z.infer<typeof IntentDomain>;
export type IntentAction = z.infer<typeof IntentAction>;
export type IntentOutputKind = z.infer<typeof IntentOutputKind>;
export type IntentOutputFormat = z.infer<typeof IntentOutputFormat>;
export type IntentCadence = z.infer<typeof IntentCadence>;
export type SideEffectExpectation = z.infer<typeof SideEffectExpectation>;
export type IntentFrame = z.infer<typeof IntentFrame>;
