import { generateObject } from "ai";
import { z } from "zod";
import { createConfiguredLanguageModel } from "../model-providers/index.js";
import { stableHash } from "../util/hash.js";
import { IntentFrame, type IntentFrame as IntentFrameType } from "./intent-frame.js";
import type { PlanTemplate } from "./plan-template-registry.js";

export interface ClassifyIntentInput {
  readonly prompt: string;
  readonly context?: {
    readonly repo_path?: string;
    readonly current_workspace?: string;
    readonly provider_preference?: string;
    readonly schedule_preference?: unknown;
  };
  readonly templates?: readonly PlanTemplate[];
  readonly now?: string;
  readonly allow_model?: boolean;
}

export async function classifyIntent(input: ClassifyIntentInput): Promise<IntentFrameType> {
  const now = input.now ?? new Date().toISOString();
  const deterministic = deterministicIntentFrame(input.prompt, input.context, now);
  if (deterministic.ambiguity.level !== "high" || input.allow_model === false) return deterministic;
  const model = createConfiguredLanguageModel("high");
  if (!model) return deterministic;
  const { object } = await generateObject({
    model,
    schema: IntentFrame,
    system: [
      "Emit an IntentFrame only.",
      "Do not execute tools or capabilities.",
      "Represent ambiguity explicitly.",
      "Do not include secrets or hidden configuration.",
    ].join("\n"),
    prompt: JSON.stringify({
      prompt: input.prompt,
      context: input.context ?? {},
      templates: (input.templates ?? []).map((template) => ({
        template_id: template.template_id,
        title: template.title,
        domains: template.domains,
        output_kind: template.output_kind,
        schedule_supported: template.schedule_supported,
      })),
      now,
    }),
  });
  return IntentFrame.parse(object);
}

export function deterministicIntentFrame(
  prompt: string,
  context: ClassifyIntentInput["context"] = {},
  now = new Date().toISOString(),
): IntentFrameType {
  const original = prompt.trim().replace(/\s+/g, " ");
  const lower = original.toLowerCase();
  const url = extractUrl(original);
  const schedule = scheduleIntent(lower, context?.schedule_preference);
  const repository = looksLikeRepository(lower) || Boolean(context?.repo_path);
  const research = Boolean(url) || looksLikeResearch(lower);
  const domain = repository && !research ? "repository" : research ? "research" : lower.includes("skill") ? "skill" : lower.includes("pack") ? "pack" : "generic";
  const action = actionFor(domain, lower, Boolean(schedule?.requested), Boolean(url));
  const output = outputFor(domain, action, Boolean(url));
  const risk = domain === "repository" ? "write" : output.kind === "markdown_brief" ? "read" : "read";
  const sideEffect = domain === "repository" ? "workspace_write" : output.kind === "markdown_brief" ? "artifact_write" : "unknown";
  const required = requiredCapabilityKinds(domain, action, Boolean(url));
  const questions = [
    ...(schedule?.requested && !schedule.time_of_day ? ["What time of day should the schedule use?"] : []),
    ...(domain === "repository" && !context?.repo_path ? ["Which repository should be used?"] : []),
  ];
  const blocking = domain === "generic" || (domain === "repository" && !context?.repo_path);
  const ambiguityLevel = blocking ? "high" : questions.length > 0 ? "medium" : "low";
  return IntentFrame.parse({
    intent_id: `intent_${stableHash({ original, now }).slice(0, 18)}`,
    original_prompt: original,
    interpreted_goal: interpretedGoal(original, domain, action),
    domain,
    action,
    output_expectation: output,
    ...(schedule ? { schedule_intent: schedule } : {}),
    constraints: [],
    non_goals: ["Execute or schedule work before user confirmation."],
    assumptions: assumptionsFor(domain, context, url),
    ambiguity: { level: ambiguityLevel, questions, blocking },
    required_capability_kinds: required,
    side_effect_expectation: sideEffect,
    risk_level: risk,
  });
}

export function extractUrl(value: string): string | undefined {
  return value.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.]+$/, "");
}

function looksLikeResearch(lower: string): boolean {
  return ["research", "brief", "cited", "citation", "summarize", "source", "sources", "markdown brief"].some((word) => lower.includes(word));
}

function looksLikeRepository(lower: string): boolean {
  return ["repo", "repository", "cli", "json output", "patch", "add ", "fix ", "change ", "update ", "implement "].some((word) => lower.includes(word));
}

function actionFor(domain: IntentFrameType["domain"], lower: string, hasSchedule: boolean, hasUrl: boolean): IntentFrameType["action"] {
  if (hasSchedule) return "schedule";
  if (domain === "repository") return "patch_repository";
  if (domain === "research" && hasUrl) return "summarize";
  if (domain === "research") return "create_brief";
  if (domain === "pack") return "build_pack";
  return lower.includes("run") ? "run_workflow" : "create_plan";
}

function outputFor(domain: IntentFrameType["domain"], action: IntentFrameType["action"], hasUrl: boolean): NonNullable<IntentFrameType["output_expectation"]> {
  if (domain === "repository") return { kind: "git_patch", format: "patch" };
  if (domain === "research" || action === "summarize" || hasUrl) return { kind: "markdown_brief", format: "markdown" };
  return { kind: "planfile", format: "markdown" };
}

function requiredCapabilityKinds(domain: IntentFrameType["domain"], action: IntentFrameType["action"], hasUrl: boolean): string[] {
  if (domain === "repository") return ["repository read", "patch preview", "verification", "review"];
  if (domain === "research" && hasUrl) return ["fetch source", "extract content", "cited brief", "markdown export"];
  if (domain === "research" || action === "schedule") return ["search sources", "fetch source", "extract content", "cited brief", "markdown export"];
  return ["planfile"];
}

function assumptionsFor(domain: IntentFrameType["domain"], context: ClassifyIntentInput["context"], url: string | undefined): string[] {
  const values = ["The prompt is sufficient for an initial reviewable Planfile."];
  if (domain === "research" && !url) values.push("Live source search should be provider-backed when configured.");
  if (context?.provider_preference) values.push(`Preferred provider: ${context.provider_preference}.`);
  if (context?.repo_path) values.push(`Repository context: ${context.repo_path}.`);
  return values;
}

function interpretedGoal(prompt: string, domain: IntentFrameType["domain"], action: IntentFrameType["action"]): string {
  if (domain === "research" && action === "schedule") return `Create a scheduled cited research brief: ${prompt}`;
  if (domain === "research") return `Create a cited research brief: ${prompt}`;
  if (domain === "repository") return `Create a repository patch plan: ${prompt}`;
  return prompt;
}

function scheduleIntent(lower: string, schedulePreference: unknown): IntentFrameType["schedule_intent"] | undefined {
  if (schedulePreference && typeof schedulePreference === "object") {
    const record = schedulePreference as Record<string, unknown>;
    return {
      requested: true,
      cadence: record.cadence === "weekly" || record.cadence === "cron" || record.cadence === "daily" ? record.cadence : "daily",
      ...(typeof record.time_of_day === "string" ? { time_of_day: record.time_of_day } : {}),
      ...(typeof record.timezone === "string" ? { timezone: record.timezone } : {}),
    };
  }
  if (!/(every morning|daily|every day|weekly|cron)/.test(lower)) return undefined;
  const time = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0];
  return {
    requested: true,
    cadence: lower.includes("weekly") ? "weekly" : lower.includes("cron") ? "cron" : "daily",
    ...(time ? { time_of_day: time } : {}),
  };
}
