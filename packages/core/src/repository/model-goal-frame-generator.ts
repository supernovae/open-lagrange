import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { deterministicGoalFrame, GoalFrame, type GoalFrame as GoalFrameType } from "../planning/goal-frame.js";
import { stableHash } from "../util/hash.js";
import { executeModelRoleCall, ModelRoleCallError } from "../models/model-route-executor.js";
import type { ModelRoleTraceContext } from "../models/model-route-executor.js";
import type { ModelUsageRecord } from "../evals/provider-usage.js";
import type { ModelRouteConfig } from "../evals/model-route-config.js";
import { buildGoalFramePrompt, goalFrameSystemPrompt } from "./goal-frame-prompt.js";
import { ModelGoalFrameOutput } from "./goal-frame-output-schema.js";

export const PlanningGenerationMode = {
  deterministic: "deterministic",
  model: "model",
  model_with_deterministic_fallback: "model_with_deterministic_fallback",
} as const;

export type PlanningGenerationMode = typeof PlanningGenerationMode[keyof typeof PlanningGenerationMode];

export interface RepositoryMetadataSummary {
  readonly package_manager?: string;
  readonly package_scripts: readonly string[];
  readonly cli_entrypoints: readonly string[];
  readonly git_branch?: string;
  readonly base_commit?: string;
  readonly relevant_files: readonly string[];
}

export interface GenerateModelGoalFrameInput {
  readonly scenario_id?: string;
  readonly repo_root: string;
  readonly original_goal: string;
  readonly repo_metadata: RepositoryMetadataSummary;
  readonly user_constraints?: readonly string[];
  readonly mode: "repo_plan" | "eval";
  readonly route: ModelRouteConfig;
  readonly telemetry_records?: ModelUsageRecord[];
  readonly trace_context?: ModelRoleTraceContext;
  readonly persist_telemetry?: boolean;
  readonly now?: string;
}

export async function generateModelGoalFrame(input: GenerateModelGoalFrameInput): Promise<GoalFrameType> {
  const now = input.now ?? new Date().toISOString();
  const prompt = buildGoalFramePrompt({ ...input, now });
  try {
    const result = await executeModelRoleCall({
      role: "planner",
      model_ref: input.route.roles.planner,
      schema: ModelGoalFrameOutput,
      system: goalFrameSystemPrompt(),
      prompt,
      trace_context: {
        ...input.trace_context,
        route_id: input.route.route_id,
        ...(input.scenario_id ? { scenario_id: input.scenario_id } : {}),
      },
      persist_telemetry: input.persist_telemetry ?? false,
    });
    input.telemetry_records?.push(result.usage_record);
    return GoalFrame.parse(result.object);
  } catch (caught) {
    if (caught instanceof ModelRoleCallError) throw caught;
    throw new ModelRoleCallError("MODEL_ROLE_CALL_FAILED", caught instanceof Error ? caught.message : String(caught));
  }
}

export function deterministicRepositoryGoalFrame(input: {
  readonly goal: string;
  readonly now: string;
}): GoalFrameType {
  return deterministicGoalFrame(input.goal, input.now);
}

export function collectRepositoryMetadataSummary(repoRoot: string): RepositoryMetadataSummary {
  const packageJson = readJson(join(repoRoot, "package.json"));
  const packageScripts = isRecord(packageJson) && isRecord(packageJson.scripts)
    ? Object.keys(packageJson.scripts).slice(0, 20)
    : [];
  const cliEntrypoints = cliEntrypointsFromPackage(packageJson);
  const packageManager = detectPackageManager(repoRoot);
  return {
    ...(packageManager ? { package_manager: packageManager } : {}),
    package_scripts: packageScripts,
    cli_entrypoints: cliEntrypoints,
    relevant_files: discoverRelevantFiles(repoRoot),
  };
}

export function fallbackPlanningTelemetry(input: {
  readonly route?: ModelRouteConfig;
  readonly mode: PlanningGenerationMode;
  readonly reason: string;
  readonly telemetry_records?: ModelUsageRecord[];
}): void {
  if (!input.route) return;
  input.telemetry_records?.push({
    provider: input.route.roles.planner.provider,
    model: input.route.roles.planner.model,
    role_label: "planner",
    route_id: input.route.route_id,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    latency_ms: 0,
    estimated: true,
    status: "fallback",
    error: `${input.mode}: ${input.reason}`,
    output_artifact_id: `planning_fallback_${stableHash({ route: input.route.route_id, reason: input.reason }).slice(0, 18)}`,
  });
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cliEntrypointsFromPackage(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  const result: string[] = [];
  if (typeof value.bin === "string") result.push(value.bin);
  if (isRecord(value.bin)) {
    for (const entry of Object.values(value.bin)) {
      if (typeof entry === "string") result.push(entry);
    }
  }
  return [...new Set(result)].slice(0, 10);
}

function detectPackageManager(repoRoot: string): string | undefined {
  const candidates: readonly [string, string][] = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
    ["bun.lockb", "bun"],
  ];
  for (const [file, manager] of candidates) {
    try {
      if (statSync(join(repoRoot, file)).isFile()) return manager;
    } catch {
      continue;
    }
  }
  return undefined;
}

function discoverRelevantFiles(repoRoot: string): readonly string[] {
  const result: string[] = [];
  for (const file of ["package.json", "README.md", "readme.md", "tsconfig.json"]) {
    try {
      if (statSync(join(repoRoot, file)).isFile()) result.push(file);
    } catch {
      continue;
    }
  }
  for (const dir of ["src", "bin", "cli"]) {
    try {
      for (const entry of readdirSync(join(repoRoot, dir)).slice(0, 12)) result.push(`${dir}/${entry}`);
    } catch {
      continue;
    }
  }
  return [...new Set(result)].slice(0, 30);
}
