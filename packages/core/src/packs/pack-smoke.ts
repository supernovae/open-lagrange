import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { descriptorToOpenCotCapability, type PackExecutionContext } from "@open-lagrange/capability-sdk";
import { createArtifactSummary, registerArtifacts } from "../artifacts/artifact-viewer.js";
import { packRegistry } from "../capability-registry/registry.js";
import { evaluatePolicyWithReport, type PolicyDecisionReport } from "../policy/policy-gate.js";
import type { CapabilityDescriptor } from "../schemas/capabilities.js";
import type { DelegationContext } from "../schemas/delegation.js";
import type { ExecutionIntent } from "../schemas/open-cot.js";
import type { ExecutionBounds, ScopedTask } from "../schemas/reconciliation.js";
import { loadInstalledPacksForRuntime } from "./runtime-pack-loader.js";

export interface PackSmokeReport {
  readonly pack_id: string;
  readonly status: "pass" | "fail" | "skipped";
  readonly capability_id?: string;
  readonly capability_name?: string;
  readonly policy_report?: PolicyDecisionReport;
  readonly output?: unknown;
  readonly artifacts: readonly unknown[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly created_at: string;
}

export async function runPackSmoke(input: {
  readonly pack_id: string;
  readonly packs_dir?: string;
  readonly index_path?: string;
  readonly now?: string;
}): Promise<PackSmokeReport> {
  const now = input.now ?? new Date().toISOString();
  loadInstalledPacksForRuntime(packRegistry, { ...(input.packs_dir ? { packs_dir: input.packs_dir } : {}), now });
  const pack = packRegistry.getPack(input.pack_id);
  const descriptors = packRegistry.listCapabilities().filter((capability) => capability.pack_id === input.pack_id);
  const capability = descriptors.find((item) => item.risk_level === "read" && !item.requires_approval) ?? descriptors[0];
  const warnings: string[] = [];
  const capturedArtifacts: unknown[] = [];

  if (!pack) return writeSmokeReport({ pack_id: input.pack_id, status: "fail", artifacts: [], errors: ["Pack is not loaded."], warnings, created_at: now }, input);
  if (!capability) return writeSmokeReport({ pack_id: input.pack_id, status: "skipped", artifacts: [], errors: [], warnings: ["Pack has no capabilities to smoke test."], created_at: now }, input);
  if (capability.risk_level !== "read" || capability.requires_approval) {
    return writeSmokeReport({
      pack_id: input.pack_id,
      status: "skipped",
      capability_id: capability.capability_id,
      capability_name: capability.name,
      artifacts: [],
      errors: [],
      warnings: ["No dry-run-safe read capability is available."],
      created_at: now,
    }, input);
  }

  try {
    const coreCapability = descriptorToOpenCotCapability(capability);
    const policy = evaluatePolicyWithReport({
      delegation_context: smokeDelegation(coreCapability, now),
      scoped_task: smokeTask(coreCapability),
      capability: coreCapability,
      intent: smokeIntent(coreCapability),
      bounds: smokeBounds(),
      endpoint_attempts_used: 0,
      now,
    });
    if (policy.result.outcome !== "allow") {
      return writeSmokeReport({
        pack_id: input.pack_id,
        status: "fail",
        capability_id: capability.capability_id,
        capability_name: capability.name,
        policy_report: policy.report,
        artifacts: [],
        errors: [`Policy decision was ${policy.result.outcome}: ${policy.result.reason}`],
        warnings,
        created_at: now,
      }, input);
    }
    const result = await packRegistry.executeCapability({ capability_id: capability.capability_id }, { query: "Smoke test", dry_run: true }, smokeContext({
      pack_id: input.pack_id,
      capability_id: capability.capability_id,
      captured_artifacts: capturedArtifacts,
      policy_report: policy.report,
    }));
    return writeSmokeReport({
      pack_id: input.pack_id,
      status: result.status === "success" ? "pass" : "fail",
      capability_id: capability.capability_id,
      capability_name: capability.name,
      policy_report: policy.report,
      output: result.output,
      artifacts: capturedArtifacts,
      errors: result.structured_errors.map(String),
      warnings,
      created_at: now,
    }, input);
  } catch (error) {
    return writeSmokeReport({
      pack_id: input.pack_id,
      status: "fail",
      capability_id: capability.capability_id,
      capability_name: capability.name,
      artifacts: capturedArtifacts,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
      created_at: now,
    }, input);
  }
}

function writeSmokeReport(report: PackSmokeReport, input: { readonly index_path?: string }): PackSmokeReport {
  const path = resolve(".open-lagrange/artifacts/pack-smoke", `${report.pack_id}.smoke-report.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  registerArtifacts({
    artifacts: [createArtifactSummary({
      artifact_id: `pack_smoke_${report.pack_id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`,
      kind: "pack_smoke_report",
      title: `Pack smoke report: ${report.pack_id}`,
      summary: `${report.status} smoke report for ${report.pack_id}`,
      path_or_uri: path,
      related_pack_id: report.pack_id,
      produced_by_pack_id: report.pack_id,
      ...(report.capability_id ? { produced_by_capability_id: report.capability_id } : {}),
      validation_status: report.status,
      content_type: "application/json",
      created_at: report.created_at,
    })],
    ...(input.index_path ? { index_path: input.index_path } : {}),
    now: report.created_at,
  });
  return report;
}

function smokeContext(input: {
  readonly pack_id: string;
  readonly capability_id: string;
  readonly captured_artifacts: unknown[];
  readonly policy_report: PolicyDecisionReport;
}): PackExecutionContext {
  return {
    delegation_context: {},
    capability_snapshot_id: "smoke_snapshot",
    project_id: "pack_smoke",
    workspace_id: "local",
    task_run_id: "pack_smoke",
    trace_id: "trace_pack_smoke",
    idempotency_key: `smoke_${input.capability_id}`,
    policy_decision: input.policy_report,
    execution_bounds: smokeBounds(),
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    async recordObservation() {},
    async recordArtifact(artifact) {
      input.captured_artifacts.push(artifact);
    },
    async recordStatus() {},
    timeout_ms: 5000,
    runtime_config: { pack_id: input.pack_id, capability_id: input.capability_id, dry_run: true },
  };
}

function smokeDelegation(capability: CapabilityDescriptor, now: string): DelegationContext {
  return {
    principal_id: "local-human",
    principal_type: "human",
    delegate_id: "pack-smoke",
    delegate_type: "runtime",
    project_id: "pack_smoke",
    workspace_id: "local",
    allowed_scopes: [],
    denied_scopes: [],
    allowed_capabilities: [capability.capability_name, `${capability.endpoint_id}.${capability.capability_name}`],
    max_risk_level: "read",
    approval_required_for: ["write", "destructive", "external_side_effect"],
    expires_at: new Date(Date.parse(now) + 60_000).toISOString(),
    trace_id: "trace_pack_smoke",
    parent_run_id: "pack_smoke",
  };
}

function smokeTask(capability: CapabilityDescriptor): ScopedTask {
  return {
    task_id: "pack_smoke",
    title: "Pack smoke test",
    objective: "Validate a dry-run-safe capability through the PackRegistry.",
    allowed_scopes: [],
    allowed_capabilities: [capability.capability_name, `${capability.endpoint_id}.${capability.capability_name}`],
    max_risk_level: "read",
  };
}

function smokeIntent(capability: CapabilityDescriptor): ExecutionIntent {
  return {
    intent_id: "pack_smoke_intent",
    snapshot_id: "smoke_snapshot",
    endpoint_id: capability.endpoint_id,
    capability_name: capability.capability_name,
    capability_digest: capability.capability_digest,
    risk_level: "read",
    requires_approval: false,
    idempotency_key: `smoke_${capability.capability_name}`,
    arguments: { query: "Smoke test", dry_run: true },
  };
}

function smokeBounds(): ExecutionBounds {
  return {
    max_tasks_per_project: 1,
    max_execution_intents_per_task: 1,
    max_total_endpoint_attempts: 1,
    max_critic_passes: 1,
    max_risk_without_approval: "read",
  };
}
