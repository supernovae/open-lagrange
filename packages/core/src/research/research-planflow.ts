import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RuntimeProfileForComposition } from "../planning/intent-to-plan-composer.js";
import { checkAndCreateRunFromPlanfile, type CheckAndCreateRunResult } from "../planning/control-plane.js";
import { composePlanfileFromIntent } from "../planning/intent-to-plan-composer.js";
import { renderPlanfileMarkdown } from "../planning/planfile-markdown.js";
import { checkAndCreateScheduleRecord, type CheckAndCreateScheduleResult } from "../planning/schedule-records.js";
import type { Planfile } from "../planning/planfile-schema.js";
import { runPlanCheck } from "../planning/plan-check.js";
import type { PlanCheckReport } from "../planning/plan-check-report.js";
import { savePlanfileContentToLibrary, type SavedPlanfileResult } from "../planning/plan-library.js";
import { buildRunSnapshot } from "../runs/run-snapshot-builder.js";
import { stableHash } from "../util/hash.js";
import { buildResearchRunView, explainResearchRun, type ResearchRunView } from "./research-run-view.js";

export interface ComposeResearchPlanInput {
  readonly topic: string;
  readonly provider_id?: string;
  readonly urls?: readonly string[];
  readonly max_sources?: number;
  readonly brief_style?: "concise" | "standard" | "technical" | "executive";
  readonly include_recommendations?: boolean;
  readonly runtime_profile?: RuntimeProfileForComposition;
  readonly now?: string;
}

export interface ResearchPlanResult {
  readonly planfile: Planfile;
  readonly markdown: string;
  readonly plan_check_report: PlanCheckReport;
  readonly warnings: readonly string[];
}

export async function composeResearchPlan(input: ComposeResearchPlanInput): Promise<ResearchPlanResult> {
  const prompt = researchPrompt(input);
  const composed = await composePlanfileFromIntent({
    prompt,
    ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}),
    mode: "dry_run",
    context: {
      ...(input.provider_id ? { provider_preference: input.provider_id } : {}),
    },
    ...(input.now ? { now: input.now } : {}),
  });
  const parameters = {
    ...objectValue(composed.planfile.execution_context?.parameters),
    topic: input.topic,
    title: `Research Brief: ${input.topic}`,
    ...(input.provider_id ? { provider_id: input.provider_id } : {}),
    max_sources: input.max_sources ?? 5,
    brief_style: input.brief_style ?? "standard",
    include_recommendations: input.include_recommendations ?? false,
    ...(input.urls ? { urls: [...input.urls] } : {}),
  };
  const planfile = {
    ...composed.planfile,
    execution_context: {
      ...composed.planfile.execution_context,
      parameters,
      nodes: applyResearchParameters(objectValue(composed.planfile.execution_context?.nodes), parameters),
    },
  } satisfies Planfile;
  const markdown = renderPlanfileMarkdown(planfile);
  return {
    planfile,
    markdown,
    plan_check_report: runPlanCheck({ planfile, live: true, ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}) }),
    warnings: composed.warnings,
  };
}

export async function checkAndCreateResearchRun(input: ComposeResearchPlanInput & {
  readonly output_dir?: string;
}): Promise<CheckAndCreateRunResult & { readonly research_plan?: ResearchPlanResult }> {
  const plan = await composeResearchPlan(input);
  const result = await checkAndCreateRunFromPlanfile({
    planfile: plan.planfile,
    live: true,
    ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}),
    ...(input.output_dir ? { output_dir: input.output_dir } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
  return { ...result, research_plan: plan };
}

export async function buildResearchRunViewForRun(input: {
  readonly run_id: string;
  readonly artifact_index_path?: string;
}): Promise<ResearchRunView | undefined> {
  const snapshot = await buildRunSnapshot({ run_id: input.run_id });
  if (!snapshot) return undefined;
  return buildResearchRunView({ snapshot, ...(input.artifact_index_path ? { artifact_index_path: input.artifact_index_path } : {}) });
}

export async function explainResearchRunById(runId: string): Promise<string> {
  const view = await buildResearchRunViewForRun({ run_id: runId });
  if (!view) return `Research run not found: ${runId}`;
  return explainResearchRun(view);
}

export function saveResearchPlanToLibrary(input: {
  readonly markdown: string;
  readonly library?: string;
  readonly path?: string;
  readonly topic: string;
}): SavedPlanfileResult {
  const path = input.path ?? join("research", `${safeName(input.topic)}.plan.md`);
  return savePlanfileContentToLibrary({
    content: input.markdown,
    path,
    ...(input.library ? { library: input.library } : {}),
  });
}

export function writeResearchPlanfile(input: {
  readonly markdown: string;
  readonly path?: string;
  readonly topic: string;
}): { readonly path: string } {
  const path = input.path ?? join(".open-lagrange", "plans", "research", `${safeName(input.topic)}.plan.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, input.markdown, "utf8");
  return { path };
}

export function scheduleResearchPlan(input: {
  readonly planfile: Planfile;
  readonly planfile_path: string;
  readonly cadence: "daily" | "weekly" | "cron";
  readonly time_of_day?: string;
  readonly timezone?: string;
  readonly runtime_profile?: string;
}): CheckAndCreateScheduleResult {
  return checkAndCreateScheduleRecord({
    planfile: input.planfile,
    planfile_path: input.planfile_path,
    cadence: input.cadence,
    ...(input.time_of_day ? { time_of_day: input.time_of_day } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    runtime_profile: input.runtime_profile ?? "local",
  });
}

function researchPrompt(input: ComposeResearchPlanInput): string {
  if (input.urls && input.urls.length > 0) return `summarize ${input.urls[0]} for ${input.topic}`;
  return `research ${input.topic}`;
}

function safeName(value: string): string {
  return `${value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "research"}-${stableHash(value).slice(0, 8)}`;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function applyResearchParameters(nodes: Record<string, unknown>, parameters: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(nodes).map(([nodeId, value]) => {
    const record = objectValue(value);
    const input = objectValue(record.input);
    if (nodeId === "plan_search") return [nodeId, { ...record, input: { ...input, topic: parameters.topic, objective: parameters.objective, provider_id: parameters.provider_id, max_results: parameters.max_sources } }];
    if (nodeId === "search_sources") return [nodeId, { ...record, input: { ...input, mode: "live", urls: parameters.urls ?? [] } }];
    if (nodeId === "select_sources") return [nodeId, { ...record, input: { ...input, max_sources: parameters.max_sources } }];
    if (nodeId === "create_source_set") return [nodeId, { ...record, input: { ...input, topic: parameters.topic, selection_policy: { ...objectValue(input.selection_policy), max_sources: parameters.max_sources } } }];
    if (nodeId === "create_brief") return [nodeId, { ...record, input: { ...input, topic: parameters.topic, brief_style: parameters.brief_style, include_recommendations: parameters.include_recommendations } }];
    if (nodeId === "export_markdown") return [nodeId, { ...record, input: { ...input, title: parameters.title } }];
    return [nodeId, value];
  }));
}
