import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createArtifactSummary, registerArtifacts, type ArtifactSummary } from "../artifacts/index.js";
import { packRegistry } from "../capability-registry/registry.js";
import { createMockDelegationContext } from "../clients/mock-delegation.js";
import { getStateStore } from "../storage/state-store.js";
import { createArtifactRef } from "../planning/plan-artifacts.js";
import { renderPlanfileMarkdown } from "../planning/planfile-markdown.js";
import { createInitialPlanState, type PlanState, type PlanStateStore } from "../planning/plan-state.js";
import { Planfile, type Planfile as PlanfileType, type PlanNode } from "../planning/planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "../planning/planfile-validator.js";
import { resolveCapabilityForStep } from "../runtime/capability-step.js";
import { runCapabilityStep } from "../runtime/capability-step-runner.js";
import type { CapabilityStepResult } from "../runtime/capability-step-schema.js";
import { stableHash } from "../util/hash.js";
import { loadRepositoryWorkspace } from "./workspace.js";
import { applyRepositoryPatchPlan } from "./patch-applier.js";
import { exportFinalPatch } from "./patch-exporter.js";
import { type PatchPolicy, RepositoryPatchPlan, ScopeExpansionRequest, type RepositoryPatchPlan as RepositoryPatchPlanType } from "./patch-plan.js";
import { validateRepositoryPatchPlan } from "./patch-validator.js";
import { collectEvidenceBundle } from "./evidence-collector.js";
import type { EvidenceBundle } from "./evidence-bundle.js";
import { detectVerificationPolicy } from "./verification-policy.js";
import { runVerificationPolicy } from "./verification-runner.js";
import type { RepositoryVerificationReport } from "./verification-report.js";
import { nextRepairAttempt, type RepairAttempt } from "./repair-loop.js";
import { RepositoryReviewReport } from "./review-report.js";
import type { RepositoryReviewReport as RepositoryReviewReportType } from "./review-report.js";
import type { WorktreeSession } from "./worktree-session.js";
import { updateWorktreeSessionStatus } from "./worktree-manager.js";
import { createRepositoryPlanStatus, updateRepositoryPlanStatus, writeRepositoryPlanStatus, type RepositoryPlanStatus } from "./repository-status.js";
import { createPatchPlanWorkOrder, defaultPatchPolicy, generatePatchPlanFromEvidence, patchPlanContextSummary, validateScopeExpansionRequest, type GeneratePatchPlanFromEvidenceInput, type PatchPlanGenerator } from "./model-patch-plan-generator.js";
import { PatchPlanGenerationError } from "./patch-plan-generation-errors.js";

export interface RepositoryPlanRunnerOptions {
  readonly store: PlanStateStore;
  readonly planfile: unknown;
  readonly session: WorktreeSession;
  readonly allow_dirty_base?: boolean;
  readonly retain_worktree?: boolean;
  readonly patch_plan_generator?: PatchPlanGenerator;
  readonly now?: string;
}

export interface RepositoryPlanRunnerResult {
  readonly state: PlanState;
  readonly status: RepositoryPlanStatus;
  readonly artifacts: readonly ArtifactSummary[];
}

interface RepositoryExecutionMemory {
  evidence?: EvidenceBundle;
  patch_plan?: RepositoryPatchPlanType;
  patch_artifact_id?: string;
  verification?: RepositoryVerificationReport;
  repairs: RepairAttempt[];
  review?: RepositoryReviewReportType;
  changed_files: string[];
  patch_validation_report_ids: string[];
  scope_expansion_request_ids: string[];
}

export class RepositoryPlanRunner {
  private readonly now: string;
  private readonly plan: PlanfileType;
  private readonly outputDir: string;
  private readonly artifacts: ArtifactSummary[] = [];
  private session: WorktreeSession;
  private status: RepositoryPlanStatus;

  constructor(private readonly options: RepositoryPlanRunnerOptions) {
    this.now = options.now ?? new Date().toISOString();
    this.plan = withCanonicalPlanDigest(Planfile.parse(options.planfile));
    this.session = updateWorktreeSessionStatus(options.session, "running");
    this.outputDir = join(this.session.repo_root, ".open-lagrange", "runs", this.plan.plan_id);
    this.status = writeRepositoryPlanStatus(updateRepositoryPlanStatus(createRepositoryPlanStatus({ plan_id: this.plan.plan_id, now: this.now }), {
      status: "running",
      worktree_session: this.session,
      current_node: "frame_goal",
    }, this.now));
  }

  async run(): Promise<RepositoryPlanRunnerResult> {
    const validation = validatePlanfile(this.plan);
    if (!validation.ok) throw new Error(validation.issues.map((issue) => issue.message).join("; "));
    this.persistExecutionCopy();
    let state = await this.options.store.recordPlanState(createInitialPlanState({
      plan_id: this.plan.plan_id,
      status: "running",
      canonical_plan_digest: this.plan.canonical_plan_digest ?? "",
      nodes: this.plan.nodes.map((node) => ({ id: node.id, status: node.depends_on.length === 0 ? "ready" : "pending" })),
      artifact_refs: [],
      markdown_projection: renderPlanfileMarkdown({ ...this.plan, status: "running" }),
      now: this.now,
    }));
    const memory: RepositoryExecutionMemory = { repairs: [], changed_files: [], patch_validation_report_ids: [], scope_expansion_request_ids: [] };
    for (const node of this.linearNodes()) {
      state = await this.markNode(state, node, "running");
      this.status = this.writeStatus({ current_node: node.id, status: "running", plan_state: state });
      const result = await this.runNode(node, memory);
      state = await this.markNode(state, node, result.status, result.artifactRefs, result.errors);
      this.status = this.writeStatus({
        plan_state: state,
        artifact_refs: [...new Set([...this.status.artifact_refs, ...result.artifactRefs.map((artifact) => artifact.artifact_id)])],
        changed_files: memory.changed_files,
        evidence_bundle_ids: memory.evidence ? [memory.evidence.evidence_bundle_id] : this.status.evidence_bundle_ids,
        patch_plan_ids: memory.patch_plan ? [memory.patch_plan.patch_plan_id] : this.status.patch_plan_ids,
        patch_plan_generated_by_model: memory.patch_plan ? true : this.status.patch_plan_generated_by_model,
        patch_validation_report_ids: memory.patch_validation_report_ids,
        scope_expansion_request_ids: memory.scope_expansion_request_ids,
        patch_artifact_ids: memory.patch_artifact_id ? [memory.patch_artifact_id] : this.status.patch_artifact_ids,
        verification_report_ids: memory.verification ? [memory.verification.verification_report_id] : this.status.verification_report_ids,
        repair_attempt_ids: memory.repairs.map((repair) => repair.repair_attempt_id),
        ...(memory.review ? { review_report_id: memory.review.review_report_id } : {}),
        errors: [...this.status.errors, ...result.errors],
      });
      if (result.status === "failed" || result.status === "yielded") break;
    }
    const finalPatch = exportFinalPatch(this.session);
    const finalArtifact = this.recordArtifact("final_patch_artifact", "Final Patch Artifact", "Validated final git patch artifact.", finalPatch, "application/json");
    this.session = updateWorktreeSessionStatus(this.session, state.status === "failed" ? "failed" : state.status === "yielded" ? "retained" : "completed", { final_patch_artifact_id: finalArtifact.artifact_id });
    this.status = this.writeStatus({
      status: state.status === "failed" ? "failed" : state.status === "yielded" ? "yielded" : "completed",
      worktree_session: this.session,
      final_patch_artifact_id: finalArtifact.artifact_id,
      artifact_refs: [...new Set([...this.status.artifact_refs, finalArtifact.artifact_id])],
      changed_files: [...finalPatch.changed_files],
    });
    registerArtifacts({ artifacts: this.artifacts, now: this.now });
    return { state, status: this.status, artifacts: this.artifacts };
  }

  private async runNode(node: PlanNode, memory: RepositoryExecutionMemory): Promise<{ readonly status: "completed" | "failed" | "yielded" | "skipped"; readonly artifactRefs: ReturnType<typeof createArtifactRef>[]; readonly errors: readonly string[] }> {
    if (node.kind === "frame" || node.kind === "design") return { status: "completed", artifactRefs: [], errors: [] };
    const workspace = loadRepositoryWorkspace({ repo_root: this.session.worktree_path, trace_id: `trace_${this.plan.plan_id}`, dry_run: false, require_approval: false });
    if (node.kind === "inspect") {
      const evidence = await collectEvidenceBundle({
        plan_id: this.plan.plan_id,
        node_id: node.id,
        goal: this.plan.goal_frame.interpreted_goal,
        workspace,
        invoke: (capabilityRef, stepInput, stepNodeId, refs) => this.invokeCapability(workspace, capabilityRef, stepInput, stepNodeId, refs),
        now: this.now,
      });
      memory.evidence = evidence;
      const artifact = this.recordArtifact("evidence_bundle", "Evidence Bundle", `${evidence.files.length} file(s), ${evidence.findings.length} finding(s).`, evidence, "application/json");
      return { status: "completed", artifactRefs: [this.planArtifactRef(artifact)], errors: [] };
    }
    if (node.kind === "patch") {
      if (!memory.evidence) return { status: "failed", artifactRefs: [], errors: ["Patch node requires an EvidenceBundle."] };
      const generated = await this.generatePatchPlan(node, memory.evidence, "initial_patch", undefined, undefined);
      if ("yielded" in generated) return generated.yielded;
      const { patchPlan, patchPolicy, contextArtifact } = generated;
      memory.patch_plan = patchPlan;
      const planArtifact = this.recordArtifact("patch_plan", "Patch Plan", patchPlan.summary, patchPlan, "application/json");
      const scopeResult = await this.handleScopeExpansionIfNeeded(node, patchPlan, memory.evidence);
      if (scopeResult) {
        memory.scope_expansion_request_ids.push(scopeResult.requestId);
        return { status: "yielded", artifactRefs: [this.planArtifactRef(contextArtifact), this.planArtifactRef(planArtifact), this.planArtifactRef(scopeResult.artifact)], errors: [scopeResult.message] };
      }
      const validation = validateRepositoryPatchPlan(workspace, patchPlan, patchPolicy);
      const validationArtifact = this.recordArtifact("patch_validation_report", "Patch Validation Report", validation.valid ? "Patch validation passed." : "Patch validation failed.", validation, "application/json");
      memory.patch_validation_report_ids.push(validationArtifact.artifact_id);
      if (!validation.valid) return { status: "failed", artifactRefs: [this.planArtifactRef(contextArtifact), this.planArtifactRef(planArtifact), this.planArtifactRef(validationArtifact)], errors: validation.violations.map((violation) => violation.message) };
      if (validation.approval_required) {
        const approvalArtifact = await this.createPatchApproval(node, patchPlan);
        return { status: "yielded", artifactRefs: [this.planArtifactRef(contextArtifact), this.planArtifactRef(planArtifact), this.planArtifactRef(validationArtifact), this.planArtifactRef(approvalArtifact)], errors: [`PatchPlan requires approval: ${approvalArtifact.artifact_id}`] };
      }
      await this.invokeCapability(workspace, "repo.propose_patch", { patch_plan: legacyPatchPlan(patchPlan, memory.evidence) }, node.id, [memory.evidence.artifact_id]);
      const patchArtifact = applyRepositoryPatchPlan({ workspace, session: this.session, patch_plan: patchPlan, patch_policy: patchPolicy, now: this.now });
      memory.patch_artifact_id = patchArtifact.artifact_id;
      memory.changed_files = patchArtifact.changed_files;
      const artifact = this.recordArtifact("patch_artifact", "Patch Artifact", `${patchArtifact.changed_files.length} changed file(s).`, patchArtifact, "application/json");
      return { status: patchArtifact.apply_status === "applied" ? "completed" : "failed", artifactRefs: [this.planArtifactRef(contextArtifact), this.planArtifactRef(planArtifact), this.planArtifactRef(validationArtifact), this.planArtifactRef(artifact)], errors: patchArtifact.errors.map((error) => error.message) };
    }
    if (node.kind === "verify") {
      const policy = detectVerificationPolicy(this.session.worktree_path);
      const commandIds = node.verification_command_ids?.length ? node.verification_command_ids : policy.allowed_commands.map((command) => command.command_id).slice(0, 1);
      const report = await runVerificationPolicy({ plan_id: this.plan.plan_id, node_id: node.id, cwd: this.session.worktree_path, commands: policy.allowed_commands, command_ids: commandIds, now: this.now });
      memory.verification = report;
      const artifact = this.recordArtifact("verification_report", "Verification Report", report.passed ? "Verification passed." : "Verification failed.", report, "application/json");
      return { status: "completed", artifactRefs: [this.planArtifactRef(artifact)], errors: [] };
    }
    if (node.kind === "repair") {
      if (!memory.verification || memory.verification.passed) return { status: "skipped", artifactRefs: [], errors: [] };
      const repair = nextRepairAttempt({ plan_id: this.plan.plan_id, node_id: node.id, previous_attempts: memory.repairs, verification_report: memory.verification, now: this.now });
      memory.repairs.push(repair);
      const repairArtifact = this.recordArtifact("repair_decision", "Repair Decision", repair.failure_summary, repair, "application/json");
      if (!memory.evidence) return { status: "yielded", artifactRefs: [this.planArtifactRef(repairArtifact)], errors: ["Repair requires an EvidenceBundle."] };
      const generated = await this.generatePatchPlan(node, memory.evidence, "repair", memory.verification.failures, `${memory.changed_files.length} changed file(s): ${memory.changed_files.join(", ")}`);
      if ("yielded" in generated) return { status: "yielded", artifactRefs: [this.planArtifactRef(repairArtifact), ...generated.yielded.artifactRefs], errors: [repair.decision.reason, ...generated.yielded.errors] };
      const { patchPlan, patchPolicy, contextArtifact } = generated;
      memory.patch_plan = patchPlan;
      const planArtifact = this.recordArtifact("repair_patch_plan", "Repair Patch Plan", patchPlan.summary, patchPlan, "application/json");
      const scopeResult = await this.handleScopeExpansionIfNeeded(node, patchPlan, memory.evidence);
      if (scopeResult) {
        memory.scope_expansion_request_ids.push(scopeResult.requestId);
        return { status: "yielded", artifactRefs: [this.planArtifactRef(repairArtifact), this.planArtifactRef(contextArtifact), this.planArtifactRef(planArtifact), this.planArtifactRef(scopeResult.artifact)], errors: [scopeResult.message] };
      }
      const validation = validateRepositoryPatchPlan(workspace, patchPlan, patchPolicy);
      const validationArtifact = this.recordArtifact("patch_validation_report", "Repair Patch Validation Report", validation.valid ? "Repair patch validation passed." : "Repair patch validation failed.", validation, "application/json");
      memory.patch_validation_report_ids.push(validationArtifact.artifact_id);
      if (!validation.valid) return { status: "yielded", artifactRefs: [this.planArtifactRef(repairArtifact), this.planArtifactRef(contextArtifact), this.planArtifactRef(planArtifact), this.planArtifactRef(validationArtifact)], errors: validation.violations.map((violation) => violation.message) };
      if (validation.approval_required) {
        const approvalArtifact = await this.createPatchApproval(node, patchPlan);
        return { status: "yielded", artifactRefs: [this.planArtifactRef(repairArtifact), this.planArtifactRef(contextArtifact), this.planArtifactRef(planArtifact), this.planArtifactRef(validationArtifact), this.planArtifactRef(approvalArtifact)], errors: [`Repair PatchPlan requires approval: ${approvalArtifact.artifact_id}`] };
      }
      const patchArtifact = applyRepositoryPatchPlan({ workspace, session: this.session, patch_plan: patchPlan, patch_policy: patchPolicy, now: this.now });
      memory.patch_artifact_id = patchArtifact.artifact_id;
      memory.changed_files = patchArtifact.changed_files;
      const patchArtifactSummary = this.recordArtifact("patch_artifact", "Repair Patch Artifact", `${patchArtifact.changed_files.length} changed file(s).`, patchArtifact, "application/json");
      return { status: "completed", artifactRefs: [this.planArtifactRef(repairArtifact), this.planArtifactRef(contextArtifact), this.planArtifactRef(planArtifact), this.planArtifactRef(validationArtifact), this.planArtifactRef(patchArtifactSummary)], errors: patchArtifact.errors.map((error) => error.message) };
    }
    if (node.kind === "review") {
      const review = RepositoryReviewReport.parse({
        review_report_id: `review_${stableHash({ plan: this.plan.plan_id, files: memory.changed_files }).slice(0, 18)}`,
        plan_id: this.plan.plan_id,
        status: memory.verification?.passed ? "ready" : "completed_with_warnings",
        title: this.plan.goal_frame.interpreted_goal.slice(0, 90),
        summary: `${memory.changed_files.length} file(s) changed.`,
        changed_files: memory.changed_files,
        verification_summary: memory.verification?.passed ? "Verification passed." : "Verification did not pass.",
        risk_notes: memory.verification?.passed ? ["Verification passed."] : ["Review verification output before applying patch."],
        followups: [],
        ...(memory.patch_artifact_id ? { final_patch_artifact_id: memory.patch_artifact_id } : {}),
        artifact_id: `review_${stableHash({ plan: this.plan.plan_id, node: node.id }).slice(0, 18)}`,
        created_at: this.now,
      });
      memory.review = review;
      const artifact = this.recordArtifact("review_report", "Review Report", review.summary, review, "application/json");
      return { status: "completed", artifactRefs: [this.planArtifactRef(artifact)], errors: [] };
    }
    return { status: "completed", artifactRefs: [], errors: [] };
  }

  private async invokeCapability(workspace: ReturnType<typeof loadRepositoryWorkspace>, capabilityRef: string, stepInput: unknown, nodeId: string, inputArtifactRefs: readonly string[] = []): Promise<CapabilityStepResult> {
    const resolved = resolveCapabilityForStep(packRegistry, capabilityRef);
    if (!resolved) throw new Error(`Unknown repository capability ${capabilityRef}`);
    const delegation = {
      ...createMockDelegationContext({
        goal: this.plan.goal_frame.interpreted_goal,
        project_id: this.plan.plan_id,
        workspace_id: workspace.workspace_id,
        delegate_id: "open-lagrange-repository-plan-runner",
        allowed_scopes: ["project:read", "project:write", "repository:read", "repository:write", "repository:verify"],
      }),
      allowed_capabilities: ["repo.list_files", "repo.read_file", "repo.search_text", "repo.propose_patch", "repo.apply_patch", "repo.run_verification", "repo.get_diff", "repo.create_review_report"],
      max_risk_level: "external_side_effect" as const,
      task_run_id: this.plan.plan_id,
    };
    return runCapabilityStep({
      step_id: `${this.plan.plan_id}:${nodeId}:${capabilityRef}`,
      plan_id: this.plan.plan_id,
      node_id: nodeId,
      capability_ref: capabilityRef,
      capability_digest: resolved.descriptor.capability_digest,
      input: stepInput,
      delegation_context: delegation,
      idempotency_key: `${this.plan.plan_id}:${nodeId}:${capabilityRef}`,
      input_artifact_refs: [...inputArtifactRefs],
      dry_run: false,
      trace_id: delegation.trace_id,
    }, {
      registry: packRegistry,
      runtime_config: { workspace },
    });
  }

  private linearNodes(): readonly PlanNode[] {
    return [...this.plan.nodes].sort((left, right) => this.plan.nodes.indexOf(left) - this.plan.nodes.indexOf(right));
  }

  private async markNode(state: PlanState, node: PlanNode, status: PlanNode["status"], artifacts: ReturnType<typeof createArtifactRef>[] = [], errors: readonly string[] = []): Promise<PlanState> {
    const nodeStates = state.node_states.map((item) => item.node_id === node.id ? { ...item, status, completed_at: status === "running" ? item.completed_at : new Date().toISOString(), artifacts, errors: [...errors] } : item);
    const planStatus = status === "yielded" ? "yielded" : status === "failed" || (errors.length > 0 && status !== "skipped") ? "failed" : nodeStates.every((item) => item.status === "completed" || item.status === "skipped") ? "completed" : "running";
    return this.options.store.recordPlanState({
      ...state,
      status: planStatus,
      node_states: nodeStates,
      artifact_refs: [...state.artifact_refs, ...artifacts],
      markdown_projection: renderPlanfileMarkdown({
        ...this.plan,
        status: planStatus,
        nodes: this.plan.nodes.map((candidate) => {
          const nodeState = nodeStates.find((item) => item.node_id === candidate.id);
          return nodeState ? { ...candidate, status: nodeState.status, artifacts: nodeState.artifacts, errors: nodeState.errors } : candidate;
        }),
        artifact_refs: [...state.artifact_refs, ...artifacts],
      }),
      updated_at: new Date().toISOString(),
    });
  }

  private persistExecutionCopy(): void {
    const path = join(this.outputDir, "plan.execution.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.plan, null, 2), "utf8");
  }

  private recordArtifact(kind: ArtifactSummary["kind"], title: string, summary: string, content: unknown, contentType: string): ArtifactSummary {
    const artifactId = typeof content === "object" && content && "artifact_id" in content && typeof (content as { artifact_id?: unknown }).artifact_id === "string"
      ? String((content as { artifact_id: string }).artifact_id)
      : `${kind}_${stableHash({ kind, title, content }).slice(0, 18)}`;
    const path = join(this.outputDir, "artifacts", `${artifactId}.${contentType.includes("markdown") ? "md" : "json"}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
    const artifact = createArtifactSummary({
      artifact_id: artifactId,
      kind,
      title,
      summary,
      path_or_uri: path,
      content_type: contentType,
      related_plan_id: this.plan.plan_id,
      produced_by_pack_id: "open-lagrange.repository",
      produced_by_plan_id: this.plan.plan_id,
      validation_status: "pass",
      redaction_status: "redacted",
    });
    this.artifacts.push(artifact);
    return artifact;
  }

  private planArtifactRef(artifact: ArtifactSummary) {
    return createArtifactRef({
      artifact_id: artifact.artifact_id,
      kind: artifact.kind === "final_patch_artifact" ? "final_patch_artifact" : artifact.kind === "review_report" ? "review_report" : artifact.kind === "verification_report" ? "verification_report" : artifact.kind === "patch_artifact" ? "patch_artifact" : artifact.kind === "patch_plan" || artifact.kind === "repair_patch_plan" ? "patch_plan" : artifact.kind === "evidence_bundle" ? "evidence_bundle" : "raw_log",
      path_or_uri: artifact.path_or_uri,
      summary: artifact.summary,
      created_at: artifact.created_at,
    });
  }

  private writeStatus(patch: Partial<Omit<RepositoryPlanStatus, "schema_version" | "plan_id" | "created_at">>): RepositoryPlanStatus {
    return writeRepositoryPlanStatus(updateRepositoryPlanStatus(this.status, patch));
  }

  private async generatePatchPlan(
    node: PlanNode,
    evidence: EvidenceBundle,
    mode: "initial_patch" | "repair",
    latestFailures: RepositoryVerificationReport["failures"] | undefined,
    currentDiffSummary: string | undefined,
  ): Promise<{ readonly patchPlan: RepositoryPatchPlanType; readonly patchPolicy: PatchPolicy; readonly contextArtifact: ArtifactSummary } | { readonly yielded: { readonly status: "failed" | "yielded"; readonly artifactRefs: ReturnType<typeof createArtifactRef>[]; readonly errors: readonly string[] } }> {
    const workOrder = createPatchPlanWorkOrder({ plan: this.plan, node, evidence, ...(latestFailures ? { latest_failures: latestFailures } : {}) });
    const allowedFiles = evidence.files.map((file) => file.path);
    const patchPolicy = defaultPatchPolicy({
      allowed_files: allowedFiles,
      denied_files: [],
      allowed_verification_command_ids: node.verification_command_ids ?? this.plan.verification_policy.allowed_command_ids,
    });
    const input: GeneratePatchPlanFromEvidenceInput = {
      plan_id: this.plan.plan_id,
      node_id: node.id,
      work_order: workOrder,
      evidence_bundle: evidence,
      allowed_files: allowedFiles,
      denied_files: patchPolicy.denied_files,
      acceptance_criteria: workOrder.acceptance_criteria,
      non_goals: workOrder.non_goals,
      constraints: workOrder.constraints,
      patch_policy: patchPolicy,
      ...(latestFailures ? { latest_failures: latestFailures } : {}),
      ...(currentDiffSummary ? { current_diff_summary: currentDiffSummary } : {}),
      mode,
      model_role_hint: mode === "repair" ? "repair_small" : "implementer_small",
    };
    const contextArtifact = this.recordArtifact("patch_plan_context", mode === "repair" ? "Repair PatchPlan Context" : "PatchPlan Context", "Redacted evidence-only PatchPlan generation context.", patchPlanContextSummary(input), "application/json");
    try {
      const patchPlan = RepositoryPatchPlan.parse(await (this.options.patch_plan_generator ?? generatePatchPlanFromEvidence)(input));
      const evidenceRefs = new Set([evidence.evidence_bundle_id, evidence.artifact_id, ...evidence.files.map((file) => file.path)]);
      const unknownRefs = patchPlan.evidence_refs.filter((ref) => !evidenceRefs.has(ref));
      if (unknownRefs.length > 0) {
        return { yielded: { status: "yielded", artifactRefs: [this.planArtifactRef(contextArtifact)], errors: [`PatchPlan referenced unknown evidence: ${unknownRefs.join(", ")}`] } };
      }
      return { patchPlan, patchPolicy, contextArtifact };
    } catch (caught) {
      if (caught instanceof PatchPlanGenerationError && caught.code === "MODEL_PROVIDER_UNAVAILABLE") {
        return { yielded: { status: "yielded", artifactRefs: [this.planArtifactRef(contextArtifact)], errors: [caught.message] } };
      }
      return { yielded: { status: "failed", artifactRefs: [this.planArtifactRef(contextArtifact)], errors: [caught instanceof Error ? caught.message : String(caught)] } };
    }
  }

  private async handleScopeExpansionIfNeeded(node: PlanNode, patchPlan: RepositoryPatchPlanType, evidence: EvidenceBundle): Promise<{ readonly requestId: string; readonly artifact: ArtifactSummary; readonly message: string } | undefined> {
    if (!patchPlan.requires_scope_expansion) return undefined;
    if (!patchPlan.scope_expansion_request) return {
      requestId: `scope_missing_${stableHash(patchPlan).slice(0, 18)}`,
      artifact: this.recordArtifact("scope_expansion_request", "Invalid Scope Expansion Request", "PatchPlan requested scope expansion without a request.", { patch_plan_id: patchPlan.patch_plan_id }, "application/json"),
      message: "PatchPlan requested scope expansion without a request.",
    };
    const request = validateScopeExpansionRequest({
      request: ScopeExpansionRequest.parse(patchPlan.scope_expansion_request),
      plan_id: this.plan.plan_id,
      node_id: node.id,
      evidence_refs: [evidence.evidence_bundle_id, evidence.artifact_id, ...evidence.files.map((file) => file.path)],
    });
    const approvalRequest = {
      approval_request_id: request.request_id,
      task_id: node.id,
      project_id: this.plan.plan_id,
      intent_id: `scope_expansion_${request.request_id}`,
      requested_risk_level: request.requested_risk_level ?? "write",
      requested_capability: "repo.scope_expansion",
      task_run_id: this.plan.plan_id,
      requested_at: this.now,
      prompt: request.reason,
      trace_id: `trace_${this.plan.plan_id}`,
    };
    const decision = await getStateStore().createApprovalRequest(approvalRequest);
    await getStateStore().recordApprovalContinuationEnvelope({
      kind: "scope_expansion",
      approval_request: approvalRequest,
      project_id: this.plan.plan_id,
      task_run_id: this.plan.plan_id,
      trace_id: `trace_${this.plan.plan_id}`,
      payload: request,
    });
    const artifact = this.recordArtifact("scope_expansion_request", "Scope Expansion Request", request.reason, request, "application/json");
    this.status = this.writeStatus({
      scope_expansion_request_ids: [...new Set([...this.status.scope_expansion_request_ids, request.request_id])],
      scope_expansion_requests: [...this.status.scope_expansion_requests, {
        request,
        approval_request_id: decision.approval_request_id,
        approval_status: decision.decision,
        suggested_approve_command: `open-lagrange repo scope approve ${decision.approval_request_id} --reason "<reason>"`,
        suggested_reject_command: `open-lagrange repo scope reject ${decision.approval_request_id} --reason "<reason>"`,
      }],
    });
    return { requestId: request.request_id, artifact, message: `Scope expansion requires approval: ${request.request_id}` };
  }

  private async createPatchApproval(node: PlanNode, patchPlan: RepositoryPatchPlanType): Promise<ArtifactSummary> {
    const request = {
      approval_request_id: `approval_${stableHash({ plan: this.plan.plan_id, node: node.id, patch: patchPlan.patch_plan_id }).slice(0, 18)}`,
      task_id: node.id,
      project_id: this.plan.plan_id,
      intent_id: `patch_${patchPlan.patch_plan_id}`,
      requested_risk_level: patchPlan.risk_level,
      requested_capability: "repo.apply_patch",
      task_run_id: this.plan.plan_id,
      requested_at: this.now,
      prompt: patchPlan.summary,
      trace_id: `trace_${this.plan.plan_id}`,
    };
    const decision = await getStateStore().createApprovalRequest(request);
    await getStateStore().recordApprovalContinuationEnvelope({
      kind: "repository_patch",
      approval_request: request,
      project_id: this.plan.plan_id,
      task_run_id: this.plan.plan_id,
      trace_id: `trace_${this.plan.plan_id}`,
      payload: { patch_plan_id: patchPlan.patch_plan_id },
    });
    return this.recordArtifact("approval_request", "Patch Approval Request", patchPlan.summary, {
      approval_request: request,
      approval_status: decision.decision,
      suggested_approve_command: `open-lagrange approve ${decision.approval_request_id} --reason "<reason>" --approval-token "$(open-lagrange approval-token ${decision.approval_request_id})"`,
      suggested_reject_command: `open-lagrange reject ${decision.approval_request_id} --reason "<reason>" --approval-token "$(open-lagrange approval-token ${decision.approval_request_id})"`,
    }, "application/json");
  }
}

function legacyPatchPlan(patchPlan: RepositoryPatchPlanType, evidence: EvidenceBundle) {
  return {
    patch_plan_id: patchPlan.patch_plan_id,
    goal: patchPlan.summary,
    summary: patchPlan.summary,
    expected_preconditions: patchPlan.preconditions.map((item) => item.summary),
    risk_level: patchPlan.risk_level,
    requires_approval: patchPlan.approval_required,
    idempotency_key: `idem_${stableHash(patchPlan).slice(0, 24)}`,
    files: patchPlan.operations.map((operation) => {
      const existing = evidence.files.find((file) => file.path === operation.relative_path);
      return {
        relative_path: operation.relative_path,
        operation: existing ? "modify" : "create",
        ...(operation.expected_sha256 ? { expected_sha256: operation.expected_sha256 } : {}),
        append_text: operation.content ?? "",
        rationale: operation.rationale,
      };
    }),
  };
}
