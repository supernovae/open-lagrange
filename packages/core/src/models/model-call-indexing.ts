import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createArtifactSummary, registerArtifacts, type ArtifactSummary } from "../artifacts/index.js";
import { listArtifacts } from "../artifacts/index.js";
import { stableHash } from "../util/hash.js";
import { ModelCallArtifact, artifactRoleForModelRole, type ModelCallArtifactStatus } from "./model-call-artifact.js";
import { redactModelCallValue } from "./model-call-redaction.js";
import type { ModelUsageRecord } from "../evals/provider-usage.js";
import { summarizeModelUsage, type ModelUsageSummary } from "../evals/provider-usage.js";

export interface PersistModelCallArtifactsInput {
  readonly artifact_dir: string;
  readonly artifact_index_path?: string;
  readonly call_id: string;
  readonly role: string;
  readonly provider: string;
  readonly model: string;
  readonly status: ModelCallArtifactStatus;
  readonly started_at: string;
  readonly completed_at?: string;
  readonly prompt: unknown;
  readonly response?: unknown;
  readonly usage_record?: ModelUsageRecord;
  readonly route_id?: string;
  readonly plan_id?: string;
  readonly node_id?: string;
  readonly work_order_id?: string;
  readonly scenario_id?: string;
  readonly eval_run_id?: string;
  readonly input_artifact_refs?: readonly string[];
  readonly output_artifact_refs?: readonly string[];
  readonly output_schema_name?: string;
  readonly schema_validation_status: "not_applicable" | "passed" | "failed";
  readonly latency_ms?: number;
  readonly error_code?: string;
  readonly error_message?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface PersistModelCallArtifactsResult {
  readonly model_call_artifact_id: string;
  readonly artifacts: readonly ArtifactSummary[];
}

export function persistModelCallArtifacts(input: PersistModelCallArtifactsInput): PersistModelCallArtifactsResult {
  mkdirSync(input.artifact_dir, { recursive: true });
  const promptRedaction = redactModelCallValue(input.prompt);
  const responseRedaction = redactModelCallValue(input.response ?? {});
  const redactionStatus = combineRedactionStatus(promptRedaction.redaction_status, responseRedaction.redaction_status);
  const base = `model_call_${stableHash({
    call: input.call_id,
    role: input.role,
    plan: input.plan_id,
    node: input.node_id,
    status: input.status,
  }).slice(0, 18)}`;
  const promptArtifactId = `${base}_prompt`;
  const responseArtifactId = `${base}_response`;
  const promptPath = join(input.artifact_dir, `${promptArtifactId}.json`);
  const responsePath = join(input.artifact_dir, `${responseArtifactId}.json`);
  writeJson(promptPath, { call_id: input.call_id, role: input.role, prompt: promptRedaction.value });
  writeJson(responsePath, { call_id: input.call_id, role: input.role, response: responseRedaction.value });

  const artifact = ModelCallArtifact.parse({
    artifact_id: base,
    artifact_kind: "model_call",
    call_id: input.call_id,
    ...(input.route_id ? { route_id: input.route_id } : {}),
    role: artifactRoleForModelRole(input.role),
    provider: input.provider,
    model: input.model,
    status: input.status,
    ...(input.plan_id ? { plan_id: input.plan_id } : {}),
    ...(input.node_id ? { node_id: input.node_id } : {}),
    ...(input.work_order_id ? { work_order_id: input.work_order_id } : {}),
    ...(input.scenario_id ? { scenario_id: input.scenario_id } : {}),
    ...(input.eval_run_id ? { eval_run_id: input.eval_run_id } : {}),
    input_artifact_refs: [...(input.input_artifact_refs ?? [])],
    output_artifact_refs: [...(input.output_artifact_refs ?? [])],
    redacted_prompt_artifact_id: promptArtifactId,
    redacted_response_artifact_id: responseArtifactId,
    ...(input.output_schema_name ? { output_schema_name: input.output_schema_name } : {}),
    schema_validation_status: input.schema_validation_status,
    token_usage: {
      ...(input.usage_record ? { input_tokens: input.usage_record.input_tokens } : {}),
      ...(input.usage_record ? { output_tokens: input.usage_record.output_tokens } : {}),
      ...(input.usage_record ? { total_tokens: input.usage_record.total_tokens } : {}),
      ...(input.usage_record?.cached_input_tokens === undefined ? {} : { cached_input_tokens: input.usage_record.cached_input_tokens }),
      ...(input.usage_record?.reasoning_tokens === undefined ? {} : { reasoning_tokens: input.usage_record.reasoning_tokens }),
      estimated: input.usage_record?.estimated ?? true,
    },
    cost: {
      ...(input.usage_record?.estimated_cost_usd === undefined ? {} : { estimated_cost_usd: input.usage_record.estimated_cost_usd }),
      ...(input.usage_record?.provider_reported_cost_usd === undefined ? {} : { provider_reported_cost_usd: input.usage_record.provider_reported_cost_usd }),
      estimated: input.usage_record?.estimated ?? true,
    },
    ...(input.latency_ms === undefined ? {} : { latency_ms: input.latency_ms }),
    started_at: input.started_at,
    ...(input.completed_at ? { completed_at: input.completed_at } : {}),
    ...(input.error_code ? { error_code: input.error_code } : {}),
    ...(input.error_message ? { error_message: input.error_message } : {}),
    redaction_status: redactionStatus,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  const artifactPath = join(input.artifact_dir, `${artifact.artifact_id}.json`);
  writeJson(artifactPath, artifact);

  const now = input.completed_at ?? input.started_at;
  const summaries = [
    createArtifactSummary({
      artifact_id: promptArtifactId,
      kind: "raw_log",
      artifact_role: "debug_log",
      title: `Model Call Prompt ${input.role}`,
      summary: "Redacted model-call prompt/context.",
      path_or_uri: promptPath,
      content_type: "application/json",
      ...(input.plan_id ? { related_plan_id: input.plan_id, produced_by_plan_id: input.plan_id } : {}),
      ...(input.node_id ? { produced_by_node_id: input.node_id } : {}),
      input_artifact_refs: [...(input.input_artifact_refs ?? [])],
      redaction_status: redactionStatus === "no_sensitive_content_detected" ? "redacted" : redactionStatus === "redaction_failed" ? "unknown" : "redacted",
      created_at: now,
    }),
    createArtifactSummary({
      artifact_id: responseArtifactId,
      kind: "raw_log",
      artifact_role: "debug_log",
      title: `Model Call Response ${input.role}`,
      summary: "Redacted model-call response.",
      path_or_uri: responsePath,
      content_type: "application/json",
      ...(input.plan_id ? { related_plan_id: input.plan_id, produced_by_plan_id: input.plan_id } : {}),
      ...(input.node_id ? { produced_by_node_id: input.node_id } : {}),
      input_artifact_refs: [promptArtifactId],
      output_artifact_refs: [...(input.output_artifact_refs ?? [])],
      redaction_status: redactionStatus === "no_sensitive_content_detected" ? "redacted" : redactionStatus === "redaction_failed" ? "unknown" : "redacted",
      created_at: now,
    }),
    createArtifactSummary({
      artifact_id: artifact.artifact_id,
      kind: "model_call",
      artifact_role: "debug_log",
      title: `Model Call ${input.role}`,
      summary: `${input.status} ${input.provider}/${input.model}`,
      path_or_uri: artifactPath,
      content_type: "application/json",
      ...(input.plan_id ? { related_plan_id: input.plan_id, produced_by_plan_id: input.plan_id } : {}),
      ...(input.node_id ? { produced_by_node_id: input.node_id } : {}),
      input_artifact_refs: [...(input.input_artifact_refs ?? []), promptArtifactId],
      output_artifact_refs: [...(input.output_artifact_refs ?? []), responseArtifactId],
      validation_status: input.schema_validation_status,
      redaction_status: redactionStatus === "no_sensitive_content_detected" ? "redacted" : redactionStatus === "redaction_failed" ? "unknown" : "redacted",
      created_at: now,
    }),
  ];
  registerArtifacts({ artifacts: summaries, ...(input.artifact_index_path ? { index_path: input.artifact_index_path } : {}), now });
  return { model_call_artifact_id: artifact.artifact_id, artifacts: summaries };
}

export function listModelCallArtifactsForPlan(planId: string, indexPath?: string): readonly ModelCallArtifact[] {
  return listArtifacts(indexPath)
    .filter((artifact) => artifact.kind === "model_call" && artifact.related_plan_id === planId)
    .map((artifact) => readArtifactContent(artifact.path_or_uri))
    .map((content) => {
      const parsed = ModelCallArtifact.safeParse(content);
      return parsed.success ? parsed.data : undefined;
    })
    .filter((artifact): artifact is ModelCallArtifact => Boolean(artifact));
}

export function modelCallArtifactRefsForPlan(planId: string, indexPath?: string): readonly string[] {
  return listModelCallArtifactsForPlan(planId, indexPath).map((artifact) => artifact.artifact_id);
}

export function summarizeModelCallArtifactsForPlan(planId: string, indexPath?: string): ModelUsageSummary | undefined {
  const records = listModelCallArtifactsForPlan(planId, indexPath).map((artifact) => usageRecordFromModelCallArtifact(artifact));
  return records.length > 0 ? summarizeModelUsage(records) : undefined;
}

function readArtifactContent(pathOrUri: string): unknown {
  const path = pathOrUri.startsWith("file://") ? pathOrUri.slice("file://".length) : pathOrUri;
  const resolved = resolve(process.env.INIT_CWD ?? process.cwd(), path);
  if (!existsSync(resolved)) return undefined;
  return JSON.parse(readFileSync(resolved, "utf8")) as unknown;
}

function usageRecordFromModelCallArtifact(artifact: ModelCallArtifact): ModelUsageRecord {
  return {
    provider: artifact.provider,
    model: artifact.model,
    role_label: artifact.role,
    ...(artifact.route_id ? { route_id: artifact.route_id } : {}),
    ...(artifact.scenario_id ? { scenario_id: artifact.scenario_id } : {}),
    ...(artifact.plan_id ? { plan_id: artifact.plan_id } : {}),
    ...(artifact.node_id ? { node_id: artifact.node_id } : {}),
    input_tokens: artifact.token_usage.input_tokens ?? 0,
    output_tokens: artifact.token_usage.output_tokens ?? 0,
    total_tokens: artifact.token_usage.total_tokens ?? 0,
    ...(artifact.token_usage.cached_input_tokens === undefined ? {} : { cached_input_tokens: artifact.token_usage.cached_input_tokens }),
    ...(artifact.token_usage.reasoning_tokens === undefined ? {} : { reasoning_tokens: artifact.token_usage.reasoning_tokens }),
    ...(artifact.cost.provider_reported_cost_usd === undefined ? {} : { provider_reported_cost_usd: artifact.cost.provider_reported_cost_usd }),
    ...(artifact.cost.estimated_cost_usd === undefined ? {} : { estimated_cost_usd: artifact.cost.estimated_cost_usd }),
    latency_ms: artifact.latency_ms ?? 0,
    estimated: artifact.token_usage.estimated,
    status: artifact.status === "success" ? "completed" : artifact.status === "provider_unavailable" ? "skipped" : "failed",
    ...(artifact.error_message ? { error: artifact.error_message } : {}),
    output_artifact_id: artifact.artifact_id,
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function combineRedactionStatus(
  left: "redacted" | "no_sensitive_content_detected" | "redaction_failed",
  right: "redacted" | "no_sensitive_content_detected" | "redaction_failed",
) {
  if (left === "redaction_failed" || right === "redaction_failed") return "redaction_failed";
  if (left === "redacted" || right === "redacted") return "redacted";
  return "no_sensitive_content_detected";
}
