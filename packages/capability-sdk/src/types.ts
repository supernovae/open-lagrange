import { z } from "zod";

export const RiskLevel = z.enum(["read", "write", "destructive", "external_side_effect"]);
export const RuntimeKind = z.enum(["local_trusted", "remote_http", "mcp_compatible", "mock", "external_adapter"]);
export const TrustLevel = z.enum(["trusted_core", "trusted_local", "review_required", "experimental"]);
export const SideEffectKind = z.enum([
  "none",
  "filesystem_read",
  "filesystem_write",
  "network_read",
  "network_write",
  "process_execution",
  "cloud_control_plane",
  "repository_mutation",
  "ticket_mutation",
  "message_send",
]);
export const IdempotencyMode = z.enum(["required", "recommended", "not_applicable"]);
export const JsonSchemaLike = z.record(z.string(), z.unknown());

export const CapabilityDescriptor = z.object({
  capability_id: z.string().min(1),
  pack_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  input_schema: JsonSchemaLike,
  output_schema: JsonSchemaLike,
  risk_level: RiskLevel,
  side_effect_kind: SideEffectKind,
  requires_approval: z.boolean(),
  idempotency_mode: IdempotencyMode,
  timeout_ms: z.number().int().min(1),
  max_attempts: z.number().int().min(1),
  scopes: z.array(z.string()),
  tags: z.array(z.string()),
  examples: z.array(z.unknown()),
  capability_digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const PackManifest = z.object({
  pack_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  publisher: z.string().min(1),
  license: z.string().min(1),
  runtime_kind: RuntimeKind,
  trust_level: TrustLevel,
  required_scopes: z.array(z.string()),
  provided_scopes: z.array(z.string()),
  default_policy: z.record(z.string(), z.unknown()),
  open_cot_alignment: z.record(z.string(), z.unknown()),
}).strict();

export const CapabilityExecutionStatus = z.enum(["success", "failed", "yielded", "requires_approval"]);

export interface Logger {
  readonly debug: (message: string, metadata?: Record<string, unknown>) => void;
  readonly info: (message: string, metadata?: Record<string, unknown>) => void;
  readonly warn: (message: string, metadata?: Record<string, unknown>) => void;
  readonly error: (message: string, metadata?: Record<string, unknown>) => void;
}

export interface PackExecutionContext {
  readonly delegation_context: unknown;
  readonly capability_snapshot_id: string;
  readonly project_id: string;
  readonly workspace_id: string;
  readonly task_run_id: string;
  readonly trace_id: string;
  readonly idempotency_key: string;
  readonly policy_decision: unknown;
  readonly approval_decision?: unknown;
  readonly execution_bounds: unknown;
  readonly logger: Logger;
  readonly recordObservation: (observation: unknown) => Promise<void>;
  readonly recordArtifact: (artifact: unknown) => Promise<void>;
  readonly recordStatus: (status: unknown) => Promise<void>;
  readonly timeout_ms: number;
  readonly runtime_config: Record<string, unknown>;
}

export interface CapabilityExecutionResult {
  readonly status: z.infer<typeof CapabilityExecutionStatus>;
  readonly output?: unknown;
  readonly observations: readonly unknown[];
  readonly structured_errors: readonly unknown[];
  readonly artifacts: readonly unknown[];
  readonly started_at: string;
  readonly completed_at: string;
  readonly duration_ms: number;
  readonly idempotency_key: string;
  readonly retry_after?: string;
  readonly approval_request?: unknown;
}

export interface CapabilityDefinition<Input = unknown, Output = unknown> {
  readonly descriptor: Omit<z.infer<typeof CapabilityDescriptor>, "capability_digest"> & {
    readonly capability_digest?: string;
  };
  readonly input_schema: z.ZodType<Input>;
  readonly output_schema: z.ZodType<Output>;
  readonly execute: (context: PackExecutionContext, input: Input) => Promise<Output> | Output;
}

export interface CapabilityPack {
  readonly manifest: z.infer<typeof PackManifest>;
  readonly capabilities: readonly CapabilityDefinition[];
  readonly initialize?: () => Promise<void>;
  readonly healthCheck?: () => Promise<{ readonly ok: boolean; readonly message?: string }>;
  readonly shutdown?: () => Promise<void>;
}

export interface CapabilityFilter {
  readonly allowed_scopes?: readonly string[];
  readonly denied_scopes?: readonly string[];
  readonly allowed_capabilities?: readonly string[];
  readonly max_risk_level?: z.infer<typeof RiskLevel>;
  readonly trust_levels?: readonly z.infer<typeof TrustLevel>[];
}

export type RiskLevel = z.infer<typeof RiskLevel>;
export type RuntimeKind = z.infer<typeof RuntimeKind>;
export type TrustLevel = z.infer<typeof TrustLevel>;
export type SideEffectKind = z.infer<typeof SideEffectKind>;
export type IdempotencyMode = z.infer<typeof IdempotencyMode>;
export type JsonSchemaLike = z.infer<typeof JsonSchemaLike>;
export type PackManifest = z.infer<typeof PackManifest>;
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptor>;
export type CapabilityExecutionStatus = z.infer<typeof CapabilityExecutionStatus>;
