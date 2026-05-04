import { performance } from "node:perf_hooks";
import { generateObject, generateText } from "ai";
import type { z } from "zod";
import { createConfiguredLanguageModel } from "../model-providers/index.js";
import type { ModelRef } from "../evals/model-route-config.js";
import { usageRecordFromProvider, type ModelUsageRecord } from "../evals/provider-usage.js";
import { stableHash } from "../util/hash.js";
import type { ModelRoleLabel } from "./model-call-telemetry.js";
import { persistModelCallArtifacts } from "./model-call-indexing.js";
import type { ModelCallArtifactStatus } from "./model-call-artifact.js";

export class ModelRoleCallError extends Error {
  constructor(readonly code: "MODEL_PROVIDER_UNAVAILABLE" | "MODEL_ROLE_CALL_FAILED", message: string) {
    super(message);
    this.name = "ModelRoleCallError";
  }
}

export interface ModelRoleTraceContext {
  readonly route_id?: string;
  readonly scenario_id?: string;
  readonly eval_run_id?: string;
  readonly plan_id?: string;
  readonly node_id?: string;
  readonly work_order_id?: string;
  readonly artifact_dir?: string;
  readonly artifact_index_path?: string;
  readonly input_artifact_refs?: readonly string[];
  readonly output_artifact_refs?: readonly string[];
  readonly output_schema_name?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ExecuteModelRoleCallInput<T> {
  readonly role: ModelRoleLabel;
  readonly model_ref: ModelRef;
  readonly schema: z.ZodType<T>;
  readonly system: string;
  readonly prompt: string;
  readonly trace_context?: ModelRoleTraceContext;
  readonly persist_telemetry?: boolean;
}

export interface ExecuteModelRoleCallResult<T> {
  readonly object: T;
  readonly usage_record: ModelUsageRecord;
  readonly telemetry_artifact_id?: string;
}

export async function executeModelRoleCall<T>(input: ExecuteModelRoleCallInput<T>): Promise<ExecuteModelRoleCallResult<T>> {
  const callId = `model_call_${stableHash({
    role: input.role,
    route: input.trace_context?.route_id,
    plan: input.trace_context?.plan_id,
    node: input.trace_context?.node_id,
    prompt: input.prompt,
    at: new Date().toISOString(),
  }).slice(0, 18)}`;
  const startedAt = new Date().toISOString();
  const model = createConfiguredLanguageModel("default", {
    provider: input.model_ref.provider,
    models: { default: input.model_ref.model },
  });
  if (!model) {
    const error = new ModelRoleCallError("MODEL_PROVIDER_UNAVAILABLE", `Model provider unavailable for ${input.role}.`);
    persistTelemetryIfRequested(input, {
      call_id: callId,
      status: "provider_unavailable",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      prompt: input.prompt,
      response: { error: error.message },
      schema_validation_status: "not_applicable",
      error_code: error.code,
      error_message: error.message,
    });
    throw error;
  }
  const started = performance.now();
  try {
    const result = await generateObject({
      model,
      schema: input.schema,
      system: input.system,
      prompt: input.prompt,
      ...(input.model_ref.temperature === undefined ? {} : { temperature: input.model_ref.temperature }),
      ...(input.model_ref.top_p === undefined ? {} : { topP: input.model_ref.top_p }),
      ...(input.model_ref.max_output_tokens === undefined ? {} : { maxOutputTokens: input.model_ref.max_output_tokens }),
    });
    const latency = Math.max(0, Math.round(performance.now() - started));
    const outputArtifactId = `model_call_${stableHash({
      role: input.role,
      route: input.trace_context?.route_id,
      plan: input.trace_context?.plan_id,
      node: input.trace_context?.node_id,
      output: result.object,
    }).slice(0, 18)}`;
    const usage = usageRecordFromProvider({
      model_ref: input.model_ref,
      prompt: input.prompt,
      output: result.object,
      provider_result: result,
      latency_ms: latency,
      status: "completed",
      output_artifact_id: outputArtifactId,
      ...(input.trace_context ? { trace_context: input.trace_context } : {}),
    });
    const persisted = persistTelemetryIfRequested(input, {
      call_id: callId,
      status: "success",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      prompt: input.prompt,
      response: result.object,
      usage_record: usage,
      latency_ms: latency,
      schema_validation_status: "passed",
    });
    return {
      object: result.object,
      usage_record: persisted ? { ...usage, output_artifact_id: persisted.model_call_artifact_id } : usage,
      ...(persisted ? { telemetry_artifact_id: persisted.model_call_artifact_id } : {}),
    };
  } catch (caught) {
    if (caught instanceof ModelRoleCallError) throw caught;
    try {
      const fallback = await generateText({
        model,
        system: input.system,
        prompt: `${input.prompt}\n\nReturn only one valid JSON object that matches the requested output schema. Do not include markdown fences, prose, commentary, or trailing text.`,
        ...(input.model_ref.temperature === undefined ? {} : { temperature: input.model_ref.temperature }),
        ...(input.model_ref.top_p === undefined ? {} : { topP: input.model_ref.top_p }),
        ...(input.model_ref.max_output_tokens === undefined ? {} : { maxOutputTokens: input.model_ref.max_output_tokens }),
      });
      const parsedJson = parseJsonFromModelText(fallback.text);
      const parsedObject = input.schema.safeParse(parsedJson);
      if (!parsedObject.success) throw new Error(parsedObject.error.message);
      const latency = Math.max(0, Math.round(performance.now() - started));
      const outputArtifactId = `model_call_${stableHash({
        role: input.role,
        route: input.trace_context?.route_id,
        plan: input.trace_context?.plan_id,
        node: input.trace_context?.node_id,
        output: parsedObject.data,
      }).slice(0, 18)}`;
      const usage = usageRecordFromProvider({
        model_ref: input.model_ref,
        prompt: input.prompt,
        output: parsedObject.data,
        provider_result: fallback,
        latency_ms: latency,
        status: "fallback",
        output_artifact_id: outputArtifactId,
        ...(input.trace_context ? { trace_context: input.trace_context } : {}),
      });
      const persisted = persistTelemetryIfRequested(input, {
        call_id: callId,
        status: "success",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        prompt: input.prompt,
        response: parsedObject.data,
        usage_record: usage,
        latency_ms: latency,
        schema_validation_status: "passed",
      });
      return {
        object: parsedObject.data,
        usage_record: persisted ? { ...usage, output_artifact_id: persisted.model_call_artifact_id } : usage,
        ...(persisted ? { telemetry_artifact_id: persisted.model_call_artifact_id } : {}),
      };
    } catch (fallbackError) {
      const message = [
        caught instanceof Error ? caught.message : String(caught),
        `JSON fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      ].join(" ");
      persistTelemetryIfRequested(input, {
        call_id: callId,
        status: "failed",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        prompt: input.prompt,
        response: { error: message },
        latency_ms: Math.max(0, Math.round(performance.now() - started)),
        schema_validation_status: "failed",
        error_code: "MODEL_ROLE_CALL_FAILED",
        error_message: message,
      });
      throw new ModelRoleCallError("MODEL_ROLE_CALL_FAILED", message);
    }
  }
}

function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const extracted = extractFirstJsonValue(trimmed);
    if (!extracted) throw new Error("Model response did not contain a JSON object.");
    return JSON.parse(extracted) as unknown;
  }
}

function extractFirstJsonValue(text: string): string | undefined {
  const start = [...text].findIndex((char) => char === "{" || char === "[");
  if (start < 0) return undefined;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return undefined;
}

function persistTelemetryIfRequested(input: ExecuteModelRoleCallInput<unknown>, event: {
  readonly call_id: string;
  readonly status: ModelCallArtifactStatus;
  readonly started_at: string;
  readonly completed_at?: string;
  readonly prompt: unknown;
  readonly response?: unknown;
  readonly usage_record?: ModelUsageRecord;
  readonly latency_ms?: number;
  readonly schema_validation_status: "not_applicable" | "passed" | "failed";
  readonly error_code?: string;
  readonly error_message?: string;
}): { readonly model_call_artifact_id: string } | undefined {
  if (!input.persist_telemetry || !input.trace_context?.artifact_dir) return undefined;
  const persisted = persistModelCallArtifacts({
    artifact_dir: input.trace_context.artifact_dir,
    ...(input.trace_context.artifact_index_path ? { artifact_index_path: input.trace_context.artifact_index_path } : {}),
    call_id: event.call_id,
    role: input.role,
    provider: input.model_ref.provider,
    model: input.model_ref.model,
    status: event.status,
    started_at: event.started_at,
    ...(event.completed_at ? { completed_at: event.completed_at } : {}),
    prompt: event.prompt,
    ...(event.response === undefined ? {} : { response: event.response }),
    ...(event.usage_record ? { usage_record: event.usage_record } : {}),
    ...(input.trace_context.route_id ? { route_id: input.trace_context.route_id } : {}),
    ...(input.trace_context.plan_id ? { plan_id: input.trace_context.plan_id } : {}),
    ...(input.trace_context.node_id ? { node_id: input.trace_context.node_id } : {}),
    ...(input.trace_context.work_order_id ? { work_order_id: input.trace_context.work_order_id } : {}),
    ...(input.trace_context.scenario_id ? { scenario_id: input.trace_context.scenario_id } : {}),
    ...(input.trace_context.eval_run_id ? { eval_run_id: input.trace_context.eval_run_id } : {}),
    input_artifact_refs: input.trace_context.input_artifact_refs ?? [],
    output_artifact_refs: input.trace_context.output_artifact_refs ?? [],
    ...(input.trace_context.output_schema_name ?? input.schema.description ? { output_schema_name: input.trace_context.output_schema_name ?? input.schema.description } : {}),
    schema_validation_status: event.schema_validation_status,
    ...(event.latency_ms === undefined ? {} : { latency_ms: event.latency_ms }),
    ...(event.error_code ? { error_code: event.error_code } : {}),
    ...(event.error_message ? { error_message: event.error_message } : {}),
    ...(input.trace_context.metadata ? { metadata: input.trace_context.metadata } : {}),
  });
  return { model_call_artifact_id: persisted.model_call_artifact_id };
}
