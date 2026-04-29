import type { Logger, PackExecutionContext } from "../types.js";
import { redaction, type PrimitiveRedactor } from "./redaction.js";

export interface PrimitiveSecretRef {
  readonly provider?: string;
  readonly name: string;
  readonly scope?: string;
}

export interface SecretAccessContext {
  readonly pack_id: string;
  readonly capability_id: string;
  readonly trace_id: string;
  readonly plan_id?: string;
  readonly node_id?: string;
  readonly task_id?: string;
}

export interface PrimitiveSecretManager {
  readonly resolveSecret: (ref: PrimitiveSecretRef, context: SecretAccessContext) => Promise<string>;
  readonly hasSecret?: (ref: PrimitiveSecretRef, context: SecretAccessContext) => Promise<boolean>;
}

export interface PrimitiveArtifactStore {
  readonly write: (artifact: unknown) => Promise<void>;
  readonly readMetadata?: (artifact_id: string) => Promise<unknown | undefined>;
  readonly link?: (from_artifact_id: string, to_artifact_id: string, metadata?: Record<string, unknown>) => Promise<void>;
}

export interface PrimitiveApprovalStore {
  readonly requestApproval: (request: unknown) => Promise<unknown>;
}

export interface PrimitiveLimits {
  readonly default_timeout_ms: number;
  readonly default_max_bytes: number;
  readonly default_redirect_limit: number;
  readonly allowed_http_methods: readonly string[];
  readonly allow_private_network: boolean;
}

export interface PrimitivePolicyContext {
  readonly allowed_hosts?: readonly string[];
  readonly denied_hosts?: readonly string[];
  readonly allowed_http_methods?: readonly string[];
  readonly allowed_scopes?: readonly string[];
  readonly granted_scopes?: readonly string[];
  readonly allow_private_network?: boolean;
}

export interface PrimitiveContext {
  readonly delegation_context: unknown;
  readonly pack_id: string;
  readonly capability_id: string;
  readonly plan_id?: string;
  readonly node_id?: string;
  readonly task_id?: string;
  readonly trace_id: string;
  readonly idempotency_key: string;
  readonly policy_context: PrimitivePolicyContext;
  readonly artifact_store: PrimitiveArtifactStore;
  readonly secret_manager?: PrimitiveSecretManager;
  readonly approval_store?: PrimitiveApprovalStore;
  readonly logger: Logger;
  readonly redactor: PrimitiveRedactor;
  readonly limits: PrimitiveLimits;
  readonly abort_signal?: AbortSignal;
  readonly fetch_impl?: typeof fetch;
}

export interface CreatePrimitiveContextOptions {
  readonly pack_id: string;
  readonly capability_id: string;
  readonly plan_id?: string;
  readonly node_id?: string;
  readonly task_id?: string;
  readonly policy_context?: PrimitivePolicyContext;
  readonly artifact_store?: PrimitiveArtifactStore;
  readonly secret_manager?: PrimitiveSecretManager;
  readonly approval_store?: PrimitiveApprovalStore;
  readonly redactor?: PrimitiveRedactor;
  readonly limits?: Partial<PrimitiveLimits>;
  readonly abort_signal?: AbortSignal;
  readonly fetch_impl?: typeof fetch;
}

export function createPrimitiveContext(
  context: PackExecutionContext,
  options: CreatePrimitiveContextOptions,
): PrimitiveContext {
  const defaultLimits: PrimitiveLimits = {
    default_timeout_ms: context.timeout_ms,
    default_max_bytes: 1_048_576,
    default_redirect_limit: 3,
    allowed_http_methods: ["GET"],
    allow_private_network: false,
  };
  return {
    delegation_context: context.delegation_context,
    pack_id: options.pack_id,
    capability_id: options.capability_id,
    ...(options.plan_id ? { plan_id: options.plan_id } : {}),
    ...(options.node_id ? { node_id: options.node_id } : {}),
    task_id: options.task_id ?? context.task_run_id,
    trace_id: context.trace_id,
    idempotency_key: context.idempotency_key,
    policy_context: options.policy_context ?? {},
    artifact_store: options.artifact_store ?? { write: context.recordArtifact },
    ...(options.secret_manager ? { secret_manager: options.secret_manager } : {}),
    ...(options.approval_store ? { approval_store: options.approval_store } : {}),
    logger: context.logger,
    redactor: options.redactor ?? redaction,
    limits: { ...defaultLimits, ...options.limits },
    ...(options.abort_signal ? { abort_signal: options.abort_signal } : {}),
    ...(options.fetch_impl ? { fetch_impl: options.fetch_impl } : {}),
  };
}
