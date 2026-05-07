import type { PackRegistry } from "@open-lagrange/capability-sdk";
import { packRegistry } from "../capability-registry/registry.js";
import type { DelegationContext } from "../schemas/delegation.js";
import { resolveCapabilityForStep } from "../runtime/capability-step.js";
import { runCapabilityStep, type CapabilityStepRunnerOptions } from "../runtime/capability-step-runner.js";
import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { PlanValidationError } from "./plan-errors.js";
import { createInitialPlanState, type PlanState, type PlanStateStore } from "./plan-state.js";
import { type Planfile, Planfile as PlanfileSchema, type PlanNode } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";
import { compileWorkOrder } from "./work-order-compiler.js";
import type { WorkOrder } from "./work-order.js";
import { createRunEvent, type RunEvent } from "../runs/run-event.js";
import { deriveRunNextActions } from "../runs/run-next-action.js";
import { structuredError } from "../reconciliation/records.js";

export type PlanNodeHandler = (workOrder: WorkOrder, context: {
  readonly plan: Planfile;
  readonly node: PlanNode;
  readonly state: PlanState;
}) => Promise<{
  readonly status: "completed" | "failed" | "yielded" | "skipped";
  readonly artifacts?: PlanNode["artifacts"];
  readonly errors?: readonly string[];
}>;

export interface PlanRunnerHandlers {
  readonly inspect?: PlanNodeHandler;
  readonly patch?: PlanNodeHandler;
  readonly verify?: PlanNodeHandler;
  readonly review?: PlanNodeHandler;
  readonly repair?: PlanNodeHandler;
  readonly [kind: string]: PlanNodeHandler | undefined;
}

export interface PlanRunnerOptions {
  readonly store: PlanStateStore;
  readonly capability_snapshot: CapabilitySnapshot;
  readonly handlers?: PlanRunnerHandlers;
  readonly registry?: PackRegistry;
  readonly delegation_context?: DelegationContext;
  readonly runtime_config?: Record<string, unknown>;
  readonly record_artifact?: CapabilityStepRunnerOptions["record_artifact"];
  readonly run_id?: string;
  readonly emit_run_event?: (event: RunEvent) => Promise<unknown> | unknown;
  readonly now?: () => string;
}

export interface PlanRunnerExecutionResult {
  readonly state: PlanState;
  readonly outputs: Readonly<Record<string, unknown>>;
}

export class PlanRunner {
  constructor(private readonly options: PlanRunnerOptions) {}

  async load(planfile: unknown): Promise<PlanState> {
    const plan = withCanonicalPlanDigest(PlanfileSchema.parse(planfile));
    const validation = validatePlanfile(plan, { capability_snapshot: this.options.capability_snapshot });
    if (!validation.ok) throw new PlanValidationError(validation.issues);
    const now = this.now();
    const state = createInitialPlanState({
      plan_id: plan.plan_id,
      status: "pending",
      canonical_plan_digest: plan.canonical_plan_digest ?? "",
      nodes: plan.nodes.map((node) => ({ id: node.id, status: node.depends_on.length === 0 ? "ready" : "pending" })),
      artifact_refs: plan.artifact_refs,
      markdown_projection: renderPlanfileMarkdown({ ...plan, status: "pending" }),
      now,
    });
    const recorded = await this.options.store.recordPlanState(state);
    await this.emit("run.created", plan, undefined, {
    });
    return recorded;
  }

  readyNodes(plan: Planfile, state: PlanState): readonly PlanNode[] {
    const completed = new Set(state.node_states.filter((node) => node.status === "completed" || node.status === "skipped").map((node) => node.node_id));
    const pending = new Set(state.node_states.filter((node) => node.status === "pending" || node.status === "ready").map((node) => node.node_id));
    return plan.nodes.filter((node) => pending.has(node.id) && node.depends_on.every((dependency) => completed.has(dependency)));
  }

  async runReadyNode(planfile: unknown): Promise<PlanState> {
    const plan = withCanonicalPlanDigest(PlanfileSchema.parse(planfile));
    const validation = validatePlanfile(plan, { capability_snapshot: this.options.capability_snapshot });
    if (!validation.ok) throw new PlanValidationError(validation.issues);
    const state = await this.options.store.getPlanState(plan.plan_id) ?? await this.load(plan);
    const node = this.readyNodes(plan, state)[0];
    if (!node) return state;
    if (canCompleteStructuralNode(node)) {
      await this.emitNodeStarted(plan, node);
      return this.markNode(plan, state, node, "completed", [], []);
    }
    const handler = this.options.handlers?.[node.kind];
    if (!handler) return this.markNode(plan, state, node, "yielded", [], [`No handler registered for ${node.kind}.`]);
    const workOrder = compileWorkOrder({ plan, node_id: node.id, capability_snapshot: this.options.capability_snapshot });
    await this.emitNodeStarted(plan, node);
    const result = await handler(workOrder, { plan, node, state });
    return this.markNode(plan, state, node, result.status, result.artifacts ?? [], result.errors ?? []);
  }

  async runToCompletion(planfile: unknown): Promise<PlanRunnerExecutionResult> {
    const plan = withCanonicalPlanDigest(PlanfileSchema.parse(planfile));
    const validation = validatePlanfile(plan, { capability_snapshot: this.options.capability_snapshot });
    if (!validation.ok) throw new PlanValidationError(validation.issues);
    let state = await this.options.store.getPlanState(plan.plan_id) ?? await this.load(plan);
    const outputs: Record<string, unknown> = {};
    await this.emit("run.started", plan, undefined, {
    });
    for (let index = 0; index < plan.nodes.length + 2; index += 1) {
      const node = this.readyNodes(plan, state)[0];
      if (!node) break;
      await this.emitNodeStarted(plan, node);
      state = await this.markNodeRunning(state, node);
      if (canCompleteStructuralNode(node)) {
        state = await this.markNode(plan, state, node, "completed", [], []);
      } else if (canRunCapabilityStep(node)) {
        const result = await this.runCapabilityNode(plan, state, node, outputs);
        if (result.output !== undefined) outputs[node.id] = result.output;
        const artifacts = result.output_artifact_refs.map((artifactId) => ({
          artifact_id: artifactId,
          kind: "capability_step_result" as const,
          path_or_uri: `artifact://${artifactId}`,
          summary: `Capability step artifact ${artifactId}`,
          created_at: this.now(),
        }));
        state = await this.markNode(plan, state, node, planStatusFromStep(result.status), artifacts, result.structured_errors.map((error) => error.message));
      } else {
        const handler = this.options.handlers?.[node.kind];
        if (!handler) {
          state = await this.markNode(plan, state, node, "yielded", [], [`No handler registered for ${node.kind}.`]);
        } else {
          const workOrder = compileWorkOrder({ plan, node_id: node.id, capability_snapshot: this.options.capability_snapshot });
          const result = await handler(workOrder, { plan, node, state });
          state = await this.markNode(plan, state, node, result.status, result.artifacts ?? [], result.errors ?? []);
        }
      }
      if (state.status === "completed" || state.status === "failed" || state.status === "yielded") break;
    }
    if (state.status === "completed") {
      await this.emit("run.completed", plan, undefined, { artifact_refs: state.artifact_refs.map((artifact) => artifact.artifact_id) });
    } else if (state.status === "failed") {
      await this.emit("run.failed", plan, undefined, { errors: state.node_states.flatMap((node) => node.errors.map((message) => structuredError({ code: "MCP_EXECUTION_FAILED", message, now: this.now(), task_id: node.node_id }))) });
    } else if (state.status === "yielded") {
      const activeNodeId = state.node_states.find((node) => node.status === "yielded")?.node_id;
      await this.emit("run.yielded", plan, undefined, { reason: "Run yielded before completion.", next_actions: deriveRunNextActions({ run_id: this.options.run_id ?? plan.plan_id, status: "yielded", ...(activeNodeId ? { active_node_id: activeNodeId } : {}), approvals: [], artifacts: [], errors: state.node_states.flatMap((node) => node.errors.map((message) => ({ message }))) }) });
    }
    return { state, outputs };
  }

  private async markNode(
    plan: Planfile,
    state: PlanState,
    node: PlanNode,
    status: "completed" | "failed" | "yielded" | "skipped",
    artifacts: PlanNode["artifacts"],
    errors: readonly string[],
  ): Promise<PlanState> {
    const now = this.now();
    const nodeStates = state.node_states.map((nodeState) => nodeState.node_id === node.id
      ? { ...nodeState, status, completed_at: now, artifacts, errors: [...errors] }
      : nodeState);
    const nextStatus: PlanState["status"] = status === "failed" ? "failed" : status === "yielded" ? "yielded" : nodeStates.every((item) => item.status === "completed" || item.status === "skipped") ? "completed" : "running";
    const projectedPlan = {
      ...plan,
      status: nextStatus,
      nodes: plan.nodes.map((candidate) => {
        const nodeState = nodeStates.find((item) => item.node_id === candidate.id);
        return nodeState ? { ...candidate, status: nodeState.status, artifacts: nodeState.artifacts, errors: nodeState.errors } : candidate;
      }),
      artifact_refs: [...plan.artifact_refs, ...artifacts],
      updated_at: now,
    };
    const recorded = await this.options.store.recordPlanState({
      ...state,
      status: nextStatus,
      node_states: nodeStates,
      artifact_refs: [...state.artifact_refs, ...artifacts],
      markdown_projection: renderPlanfileMarkdown(projectedPlan),
      updated_at: now,
    });
    await this.emit(nodeEventForStatus(status), plan, node, {
      status,
      title: node.title,
      kind: node.kind,
      artifact_refs: artifacts.map((artifact) => artifact.artifact_id),
      errors: errors.map((message) => structuredError({ code: "MCP_EXECUTION_FAILED", message, now, task_id: node.id })),
      reason: errors[0] ?? `Node ${status}.`,
      next_actions: deriveRunNextActions({ run_id: this.options.run_id ?? plan.plan_id, status, active_node_id: node.id, approvals: [], artifacts: [], errors: errors.map((message) => ({ message })) }),
    });
    for (const artifact of artifacts) {
      await this.emit("artifact.created", plan, node, {
        artifact_id: artifact.artifact_id,
        kind: artifact.kind,
        summary: artifact.summary,
        path_or_uri: artifact.path_or_uri,
      }, { artifact_id: artifact.artifact_id });
    }
    await this.emitPhaseCompleted(plan, node, status);
    return recorded;
  }

  private async markNodeRunning(state: PlanState, node: PlanNode): Promise<PlanState> {
    const now = this.now();
    return this.options.store.recordPlanState({
      ...state,
      status: "running",
      node_states: state.node_states.map((nodeState) => nodeState.node_id === node.id
        ? { ...nodeState, status: "running", started_at: nodeState.started_at ?? now }
        : nodeState),
      updated_at: now,
    });
  }

  private async runCapabilityNode(
    plan: Planfile,
    state: PlanState,
    node: PlanNode,
    outputs: Readonly<Record<string, unknown>>,
  ) {
    const registry = this.options.registry ?? packRegistry;
    const capabilityRef = node.allowed_capability_refs[0] ?? "";
    const resolved = resolveCapabilityForStep(registry, capabilityRef);
    if (!resolved) throw new Error(`Unknown capability: ${capabilityRef}`);
    if (!this.options.delegation_context) throw new Error("Capability PlanRunner execution requires a delegation context.");
    const input = resolveTemplates(nodeInput(plan, node.id), outputs);
    return runCapabilityStep({
      step_id: `${plan.plan_id}:${node.id}`,
      plan_id: plan.plan_id,
      node_id: node.id,
      capability_ref: capabilityRef,
      capability_digest: resolved.descriptor.capability_digest,
      input,
      delegation_context: this.options.delegation_context,
      idempotency_key: `${plan.plan_id}:${node.id}:${resolved.descriptor.capability_digest}`,
      input_artifact_refs: [...inputArtifactRefs(state, node)],
      dry_run: shouldDryRunNode(plan, node),
      trace_id: this.options.delegation_context.trace_id,
    }, {
      registry,
      now: this.now(),
      ...(this.options.run_id ? { run_id: this.options.run_id } : {}),
      ...(this.options.emit_run_event ? { emit_run_event: this.options.emit_run_event } : {}),
      runtime_config: {
        ...(this.options.runtime_config ?? {}),
        plan_id: plan.plan_id,
        node_id: node.id,
        ...(this.options.run_id ? { run_id: this.options.run_id } : {}),
      },
      ...(this.options.record_artifact ? { record_artifact: this.options.record_artifact } : {}),
    });
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }

  private async emitNodeStarted(plan: Planfile, node: PlanNode): Promise<void> {
    await this.emit("node.started", plan, node, {
      title: node.title,
      kind: node.kind,
    });
    await this.emitPhaseStarted(plan, node);
  }

  private async emitPhaseStarted(plan: Planfile, node: PlanNode): Promise<void> {
    if (node.kind === "verify") await this.emit("verification.started", plan, node, { command_id: node.id });
    if (node.kind === "repair") await this.emit("repair.started", plan, node, { repair_attempt: 1 });
  }

  private async emitPhaseCompleted(plan: Planfile, node: PlanNode, status: "completed" | "failed" | "yielded" | "skipped"): Promise<void> {
    if (node.kind === "verify") await this.emit("verification.completed", plan, node, { command_id: node.id, passed: status === "completed" });
    if (node.kind === "repair") await this.emit("repair.completed", plan, node, { repair_attempt: 1, status });
  }

  private async emit(type: RunEvent["type"], plan: Planfile, node?: PlanNode, payload: Record<string, unknown> = {}, ids: { readonly artifact_id?: string; readonly approval_id?: string; readonly model_call_artifact_id?: string } = {}): Promise<void> {
    if (!this.options.run_id || !this.options.emit_run_event) return;
    const base = { run_id: this.options.run_id, plan_id: plan.plan_id, timestamp: this.now() };
    const attempt_id = node ? attemptId(plan, node) : undefined;
    if (type === "run.created" || type === "run.started" || type === "run.cancelled") {
      await this.options.emit_run_event(createRunEvent({ ...base, type, ...(type === "run.cancelled" && typeof payload.reason === "string" ? { reason: payload.reason } : {}) }));
      return;
    }
    if (type === "run.completed") {
      await this.options.emit_run_event(createRunEvent({ ...base, type, artifact_refs: stringArray(payload.artifact_refs) }));
      return;
    }
    if (type === "run.failed") {
      await this.options.emit_run_event(createRunEvent({ ...base, type, errors: structuredErrors(payload.errors) }));
      return;
    }
    if (type === "run.yielded") {
      await this.options.emit_run_event(createRunEvent({ ...base, type, reason: stringField(payload.reason) ?? "Run yielded.", next_actions: Array.isArray(payload.next_actions) ? payload.next_actions as never : [] }));
      return;
    }
    if (!node || !attempt_id) return;
    const nodeBase = { ...base, node_id: node.id, attempt_id, title: node.title };
    if (type === "node.started") await this.options.emit_run_event(createRunEvent({ ...nodeBase, type }));
    else if (type === "node.completed") await this.options.emit_run_event(createRunEvent({ ...nodeBase, type, artifact_refs: stringArray(payload.artifact_refs) }));
    else if (type === "node.failed") await this.options.emit_run_event(createRunEvent({ ...nodeBase, type, errors: structuredErrors(payload.errors) }));
    else if (type === "node.yielded") await this.options.emit_run_event(createRunEvent({ ...nodeBase, type, reason: stringField(payload.reason) ?? "Node yielded.", next_actions: Array.isArray(payload.next_actions) ? payload.next_actions as never : [] }));
    else if (type === "artifact.created" && ids.artifact_id) await this.options.emit_run_event(createRunEvent({ ...base, type, node_id: node.id, artifact_id: ids.artifact_id, kind: stringField(payload.kind) ?? "capability_step_result" }));
    else if (type === "verification.started") await this.options.emit_run_event(createRunEvent({ ...nodeBase, type, command_id: stringField(payload.command_id) ?? node.id }));
    else if (type === "verification.completed") await this.options.emit_run_event(createRunEvent({ ...nodeBase, type, command_id: stringField(payload.command_id) ?? node.id, passed: Boolean(payload.passed), ...(stringField(payload.report_ref) ? { report_ref: stringField(payload.report_ref) } : {}) }));
    else if (type === "repair.started") await this.options.emit_run_event(createRunEvent({ ...nodeBase, type, repair_attempt: numberField(payload.repair_attempt) ?? 1 }));
    else if (type === "repair.completed") await this.options.emit_run_event(createRunEvent({ ...nodeBase, type, repair_attempt: numberField(payload.repair_attempt) ?? 1, status: stringField(payload.status) ?? "completed" }));
  }
}

function attemptId(plan: Planfile, node: PlanNode): string {
  return `attempt_${plan.plan_id}_${node.id}_initial`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function structuredErrors(value: unknown): ReturnType<typeof structuredError>[] {
  return Array.isArray(value) ? value.filter((item): item is ReturnType<typeof structuredError> => Boolean(item && typeof item === "object" && "message" in item && "code" in item && "observed_at" in item)) : [];
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function nodeEventForStatus(status: "completed" | "failed" | "yielded" | "skipped"): RunEvent["type"] {
  if (status === "completed" || status === "skipped") return "node.completed";
  if (status === "failed") return "node.failed";
  return "node.yielded";
}

function canRunCapabilityStep(node: PlanNode): boolean {
  return node.allowed_capability_refs.length === 1 && node.kind !== "frame";
}

function canCompleteStructuralNode(node: PlanNode): boolean {
  return node.kind === "frame" && node.allowed_capability_refs.length === 0;
}

function shouldDryRunNode(plan: Planfile, node: PlanNode): boolean {
  return node.execution_mode ? node.execution_mode === "dry_run" : plan.mode === "dry_run";
}

function nodeInput(plan: Planfile, nodeId: string): unknown {
  const context = plan.execution_context;
  const nodes = context && typeof context === "object" ? (context as Record<string, unknown>).nodes : undefined;
  const nodeConfig = nodes && typeof nodes === "object" ? (nodes as Record<string, unknown>)[nodeId] : undefined;
  if (!nodeConfig || typeof nodeConfig !== "object") return {};
  return (nodeConfig as Record<string, unknown>).input ?? {};
}

function resolveTemplates(value: unknown, outputs: Readonly<Record<string, unknown>>): unknown {
  if (typeof value === "string") return resolveTemplateString(value, outputs);
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, outputs));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveTemplates(item, outputs)]));
  }
  return value;
}

function resolveTemplateString(value: string, outputs: Readonly<Record<string, unknown>>): unknown {
  const wholeOutput = /^\$nodes\.([^.]+)\.output$/.exec(value);
  if (wholeOutput) return outputs[wholeOutput[1] ?? ""];
  const exact = /^\$nodes\.([^.]+)\.output\.(.+)$/.exec(value);
  if (exact) return pathValue(outputs[exact[1] ?? ""], exact[2] ?? "");
  return value.replace(/\{\{nodes\.([^.]+)\.output\.([^}]+)\}\}/g, (_match, nodeId: string, path: string) => {
    const resolved = pathValue(outputs[nodeId], path);
    return resolved === undefined ? "" : String(resolved);
  });
}

function pathValue(source: unknown, path: string): unknown {
  return pathPartsValue(source, path.split("."));
}

function pathPartsValue(source: unknown, parts: readonly string[]): unknown {
  if (parts.length === 0) return source;
  const [part, ...rest] = parts;
  if (part === undefined) return source;
  if (Array.isArray(source)) {
    if (/^\d+$/.test(part)) return pathPartsValue(source[Number(part)], rest);
    return source.map((item) => pathPartsValue(item, parts)).filter((item) => item !== undefined);
  }
  return [part].reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return pathPartsValue((current as Record<string, unknown>)[key], rest);
  }, source);
}

function inputArtifactRefs(state: PlanState, node: PlanNode): readonly string[] {
  return state.node_states
    .filter((candidate) => node.depends_on.includes(candidate.node_id))
    .flatMap((candidate) => candidate.artifacts.map((artifact) => artifact.artifact_id));
}

function planStatusFromStep(status: "success" | "failed" | "yielded" | "requires_approval"): "completed" | "failed" | "yielded" {
  if (status === "success") return "completed";
  if (status === "failed") return "failed";
  return "yielded";
}
