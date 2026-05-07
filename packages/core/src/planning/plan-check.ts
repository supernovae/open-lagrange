import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import type { StructuredError } from "../schemas/open-cot.js";
import { NextAction } from "../runs/run-next-action.js";
import { stableHash } from "../util/hash.js";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import { derivePlanRequirements, type RuntimeProfileForRequirements } from "./plan-requirements.js";
import { type PlanValidationIssue } from "./plan-errors.js";
import { Planfile, type Planfile as PlanfileType, type PlanNode } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";
import { ApprovalRequirementSummary, PlanCheckReport, PredictedArtifact, RequirementStatus, SideEffectSummary, type RequirementStatus as RequirementStatusType } from "./plan-check-report.js";

export interface RunPlanCheckInput {
  readonly planfile: unknown;
  readonly runtime_profile?: RuntimeProfileForRequirements;
  readonly available_packs?: readonly string[];
  readonly capability_snapshot?: CapabilitySnapshot;
  readonly live?: boolean;
  readonly now?: string;
}

export function runPlanCheck(input: RunPlanCheckInput): PlanCheckReport {
  const now = input.now ?? new Date().toISOString();
  let parsed: PlanfileType | undefined;
  const validation = validatePlanfile(input.planfile, snapshotOptions(input, now));
  try {
    parsed = withCanonicalPlanDigest(Planfile.parse(input.planfile));
  } catch {
    return PlanCheckReport.parse({
      plan_id: fallbackPlanId(input.planfile),
      plan_digest: stableHash(input.planfile),
      status: "invalid",
      portability: "machine_bound",
      required_packs: [],
      required_providers: [],
      required_credentials: [],
      required_permissions: [],
      approval_requirements: [],
      execution_mode_warnings: [],
      side_effects: [],
      predicted_artifacts: [],
      validation_errors: validation.issues.map((issue) => structuredErrorForIssue(issue, now)),
      warnings: [],
      suggested_actions: [editPlanAction()],
    });
  }

  const requirements = derivePlanRequirements({
    planfile: parsed,
    ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}),
    ...(input.available_packs ? { available_packs: input.available_packs } : {}),
  });
  const validationErrors = validation.issues.map((issue) => structuredErrorForIssue(issue, now));
  const hardValidationErrors = validation.issues.filter((issue) => issue.severity === "error" && issue.code !== "APPROVAL_REQUIRED");
  const approvalIssues = validation.issues.filter((issue) => issue.code === "APPROVAL_REQUIRED");
  const explicitRequirements = parsed.requirements;
  const missingRuntime = runtimeRequirements(parsed, input.runtime_profile);
  const requiredPacks = requirements.required_packs.map((id) => requirement("pack", id, requirements.missing_packs.includes(id), `open-lagrange pack install ${id}`));
  const requiredProviders = requirements.required_providers.map((id) => requirement("provider", id, requirements.missing_providers.includes(id), providerCommand(id)));
  const requiredCredentials = requirements.required_credentials.map((id) => requirement("credential", id, requirements.missing_credentials.includes(id), `open-lagrange secrets set ${id} --from-stdin`));
  const requiredPermissions = requirements.permissions.map((id) => requirement("permission", id, requirements.missing_permissions.includes(id), approvalCommand(parsed.plan_id, id)));
  const unsupportedTemplates = unsupportedTemplateRequirements(parsed);
  const scheduleRequirements = scheduleRequirementsFor(parsed);
  const approvals = approvalRequirementsFor(parsed, approvalIssues);
  const executionWarnings = executionModeWarningsFor(parsed, input.live === true);
  const warnings = unique([...requirements.warnings, ...executionWarnings, ...portabilityWarnings(parsed, requirements.portability_level), ...optionalWarnings(explicitRequirements)]);
  const missingRequired = [
    ...requiredPacks,
    ...requiredProviders,
    ...requiredCredentials,
    ...requiredPermissions,
    ...missingRuntime,
    ...unsupportedTemplates,
  ].some((item) => item.status === "missing" || item.status === "misconfigured" || item.status === "unsupported");
  const unsafe = hardValidationErrors.some((issue) => issue.code === "DESTRUCTIVE_GOAL_NOT_EXPLICIT")
    || executionWarnings.some((warning) => /fixture|mock/i.test(warning) && input.live === true);
  const status = hardValidationErrors.length > 0
    ? unsafe ? "unsafe" : "invalid"
    : missingRequired
      ? "missing_requirements"
      : warnings.length > 0 || approvals.length > 0 || requirements.side_effects.length > 0
        ? "runnable_with_warnings"
        : "runnable";
  const report = {
    plan_id: parsed.plan_id,
    plan_digest: parsed.canonical_plan_digest ?? stableHash(parsed),
    status,
    portability: requirements.portability_level,
    required_packs: requiredPacks,
    required_providers: requiredProviders,
    required_credentials: requiredCredentials,
    required_permissions: requiredPermissions,
    approval_requirements: approvals,
    ...(scheduleRequirements.length > 0 ? { schedule_requirements: scheduleRequirements } : {}),
    execution_mode_warnings: executionWarnings,
    side_effects: sideEffectsFor(parsed),
    predicted_artifacts: predictedArtifactsFor(parsed),
    validation_errors: validationErrors,
    warnings,
    suggested_actions: suggestedActionsFor({
      plan: parsed,
      missing: [...requiredPacks, ...requiredProviders, ...requiredCredentials, ...requiredPermissions, ...missingRuntime, ...unsupportedTemplates].filter((item) => item.status !== "present"),
      approvals,
      invalid: hardValidationErrors.length > 0,
    }),
  };
  return PlanCheckReport.parse(report);
}

function unsupportedTemplateRequirements(plan: PlanfileType): RequirementStatusType[] {
  const template = objectValue(plan.execution_context?.template);
  if (template.template_id !== "research.digest") return [];
  return [RequirementStatus.parse({
    kind: "runtime",
    id: "template.research.digest",
    label: "Research digest execution",
    required: true,
    status: "unsupported",
    detail: "research.digest is scaffold-only until multi-topic branch execution is available.",
    suggested_command: "open-lagrange plan instantiate <template> --write <path>",
  })];
}

function snapshotOptions(input: RunPlanCheckInput, now: string): { readonly capability_snapshot?: CapabilitySnapshot } {
  if (input.capability_snapshot) return { capability_snapshot: input.capability_snapshot };
  if (!input.available_packs) return {};
  const capabilityRefs = planCapabilityRefs(input.planfile);
  return {
    capability_snapshot: createCapabilitySnapshotForTask({
      allowed_capabilities: capabilityRefs,
      allowed_scopes: ["project:read", "research:read"],
      max_risk_level: "read",
      now,
    }),
  };
}

function planCapabilityRefs(planfile: unknown): string[] {
  try {
    return [...new Set(Planfile.parse(planfile).nodes.flatMap((node) => node.allowed_capability_refs))];
  } catch {
    return [];
  }
}

function requirement(kind: RequirementStatusType["kind"], id: string, missing: boolean, suggestedCommand?: string): RequirementStatusType {
  return RequirementStatus.parse({
    kind,
    id,
    label: labelFor(id),
    required: true,
    status: missing ? "missing" : "present",
    ...(missing && suggestedCommand ? { suggested_command: suggestedCommand } : {}),
  });
}

function runtimeRequirements(plan: PlanfileType, runtimeProfile: RuntimeProfileForRequirements | undefined): RequirementStatusType[] {
  const modes = plan.requirements?.runtime?.mode ?? [];
  if (modes.length === 0) return [];
  const current = runtimeProfile?.name;
  const present = current ? modes.includes(current === "remote" ? "remote" : "local") : modes.includes("local");
  return [RequirementStatus.parse({
    kind: "runtime",
    id: "runtime.mode",
    label: `Runtime mode: ${modes.join(" or ")}`,
    required: true,
    status: present ? "present" : "unsupported",
    ...(!present ? { detail: `Current profile does not match required runtime mode: ${modes.join(", ")}` } : {}),
  })];
}

function scheduleRequirementsFor(plan: PlanfileType): RequirementStatusType[] {
  const schedule = plan.execution_context?.schedule_intent ?? plan.requirements?.runtime;
  if (!schedule) return [];
  return [RequirementStatus.parse({
    kind: "schedule",
    id: "schedule",
    label: "Schedule definition",
    required: false,
    status: "present",
  })];
}

function approvalRequirementsFor(plan: PlanfileType, approvalIssues: readonly PlanValidationIssue[]): ApprovalRequirementSummary[] {
  const fromNodes = plan.nodes.filter((node) => node.approval_required).map((node) => approvalForNode(plan, node));
  const fromIssues = approvalIssues.flatMap((issue) => {
    const nodeId = issue.path?.find((item): item is string => typeof item === "string" && plan.nodes.some((node) => node.id === item));
    const node = nodeId ? plan.nodes.find((candidate) => candidate.id === nodeId) : undefined;
    return node ? [approvalForNode(plan, node)] : [];
  });
  const byId = new Map([...fromNodes, ...fromIssues].map((item) => [item.approval_id, item]));
  return [...byId.values()].sort((left, right) => left.approval_id.localeCompare(right.approval_id));
}

function approvalForNode(plan: PlanfileType, node: PlanNode): ApprovalRequirementSummary {
  return ApprovalRequirementSummary.parse({
    approval_id: `${plan.plan_id}:${node.id}:approval`,
    label: `${node.title} approval`,
    risk_level: node.risk_level,
    node_id: node.id,
    required: true,
    suggested_command: `open-lagrange approval approve ${plan.plan_id}:${node.id}:approval --reason "approved"`,
  });
}

function sideEffectsFor(plan: PlanfileType): SideEffectSummary[] {
  return plan.nodes.filter((node) => node.risk_level !== "read").map((node) => SideEffectSummary.parse({
    node_id: node.id,
    label: node.title,
    risk_level: node.risk_level,
    requires_approval: node.approval_required,
  }));
}

function predictedArtifactsFor(plan: PlanfileType): PredictedArtifact[] {
  return plan.nodes.flatMap((node) => node.expected_outputs.map((output, index) => PredictedArtifact.parse({
    kind: artifactKindFor(output),
    label: output,
    node_id: node.id,
    artifact_id: `${node.id}:expected:${index + 1}`,
  })));
}

function artifactKindFor(output: string): string {
  if (/brief/i.test(output)) return "research_brief";
  if (/patch/i.test(output)) return "patch_artifact";
  if (/verification|test/i.test(output)) return "verification_report";
  if (/plan/i.test(output)) return "planfile";
  return "capability_step_result";
}

function executionModeWarningsFor(plan: PlanfileType, live: boolean): string[] {
  return plan.nodes.flatMap((node) => {
    const mode = node.execution_mode ?? "live";
    if ((mode === "fixture" || mode === "mock") && live) return [`${node.id} uses ${mode} execution and cannot be used for a normal live run.`];
    if (mode === "dry_run" && live) return [`${node.id} is marked dry_run and will be converted before live execution.`];
    return [];
  });
}

function portabilityWarnings(plan: PlanfileType, portability: string): string[] {
  if (portability === "portable") return [];
  if (portability === "machine_bound") return ["Planfile contains machine-bound details such as absolute local paths."];
  if (portability === "profile_bound") return ["Planfile depends on profile-specific providers or credentials."];
  return plan.nodes.some((node) => node.allowed_capability_refs.some((ref) => ref.startsWith("repo.")))
    ? ["Planfile depends on the current workspace."]
    : [];
}

function optionalWarnings(requirements: PlanfileType["requirements"]): string[] {
  if (!requirements) return [];
  return [
    ...(requirements.packs ?? []).filter((item) => item.required === false).map((item) => `Optional pack not required before run: ${item.id}`),
    ...(requirements.providers ?? []).filter((item) => item.required === false).map((item) => `Optional provider not required before run: ${item.id}`),
    ...(requirements.credentials ?? []).filter((item) => item.required === false).map((item) => `Optional credential not required before run: ${item.ref}`),
  ];
}

function suggestedActionsFor(input: {
  readonly plan: PlanfileType;
  readonly missing: readonly RequirementStatusType[];
  readonly approvals: readonly ApprovalRequirementSummary[];
  readonly invalid: boolean;
}): NextAction[] {
  const actions = input.missing.map((item) => NextAction.parse({
    action_id: `configure:${item.kind}:${item.id}`,
    label: item.label,
    ...(item.suggested_command ? { command: item.suggested_command } : {}),
    action_type: item.kind === "permission" || item.kind === "approval" ? "approve" : "configure_provider",
    required: item.required,
    target_ref: item.id,
    ...(item.detail ? { description: item.detail } : {}),
  }));
  for (const approval of input.approvals) {
    actions.push(NextAction.parse({
      action_id: `approve:${approval.approval_id}`,
      label: approval.label,
      ...(approval.suggested_command ? { command: approval.suggested_command } : {}),
      action_type: "approve",
      required: approval.required,
      target_ref: approval.approval_id,
    }));
  }
  if (input.invalid) actions.push(editPlanAction());
  actions.push(NextAction.parse({
    action_id: `run:${input.plan.plan_id}`,
    label: "Run now",
    command: `open-lagrange plan run ${input.plan.plan_id}`,
    action_type: "resume",
    required: false,
    target_ref: input.plan.plan_id,
  }));
  return dedupeActions(actions);
}

function editPlanAction(): NextAction {
  return NextAction.parse({
    action_id: "edit_plan",
    label: "Edit Planfile",
    command: "open-lagrange plan check <planfile>",
    action_type: "edit_plan",
    required: true,
  });
}

function providerCommand(id: string): string {
  if (id === "search") return "open-lagrange init --runtime podman --with-search";
  return `open-lagrange provider check ${id}`;
}

function approvalCommand(planId: string, id: string): string {
  return `open-lagrange approval request ${planId} --permission ${id}`;
}

function structuredErrorForIssue(issue: PlanValidationIssue, now: string): StructuredError {
  return {
    code: issue.code === "UNKNOWN_CAPABILITY" ? "UNKNOWN_CAPABILITY" : issue.code === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : "INVALID_PLAN",
    message: issue.message,
    observed_at: now,
    details: { severity: issue.severity, path: issue.path, issue_code: issue.code },
  };
}

function fallbackPlanId(value: unknown): string {
  if (value && typeof value === "object" && "plan_id" in value) {
    const planId = (value as { readonly plan_id?: unknown }).plan_id;
    if (typeof planId === "string" && planId.length > 0) return planId;
  }
  return "unknown_plan";
}

function labelFor(id: string): string {
  return id.split(/[.:_-]/u).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dedupeActions(actions: readonly NextAction[]): NextAction[] {
  return [...new Map(actions.map((action) => [action.action_id, action])).values()];
}
