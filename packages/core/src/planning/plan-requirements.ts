import { isAbsolute } from "node:path";
import { z } from "zod";
import type { Planfile, PlanNode } from "./planfile-schema.js";

export const PlanPortabilityLevel = z.enum(["portable", "workspace_bound", "profile_bound", "machine_bound"]);
export type PlanPortabilityLevel = z.infer<typeof PlanPortabilityLevel>;

export const PlanRequirementStatus = z.enum(["present", "missing", "unknown", "not_required"]);
export type PlanRequirementStatus = z.infer<typeof PlanRequirementStatus>;

export const PlanRequirementsReport = z.object({
  plan_id: z.string().min(1),
  portability_level: PlanPortabilityLevel,
  required_packs: z.array(z.string().min(1)),
  required_providers: z.array(z.string().min(1)),
  required_credentials: z.array(z.string().min(1)),
  permissions: z.array(z.string().min(1)),
  approval_requirements: z.array(z.string().min(1)),
  side_effects: z.array(z.string().min(1)),
  schedule_info: z.unknown().optional(),
  missing_packs: z.array(z.string().min(1)),
  missing_providers: z.array(z.string().min(1)),
  missing_credentials: z.array(z.string().min(1)),
  missing_permissions: z.array(z.string().min(1)),
  suggested_commands: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
}).strict();

export type PlanRequirementsReport = z.infer<typeof PlanRequirementsReport>;

export interface RuntimeProfileForRequirements {
  readonly name?: string | undefined;
  readonly activeModelProvider?: string | undefined;
  readonly modelProviders?: Record<string, unknown> | undefined;
  readonly searchProviders?: readonly { readonly id: string; readonly kind: string; readonly enabled?: boolean | undefined }[] | undefined;
  readonly secretRefs?: Record<string, unknown> | undefined;
}

export interface DerivePlanRequirementsInput {
  readonly planfile: Planfile;
  readonly runtime_profile?: RuntimeProfileForRequirements;
  readonly available_packs?: readonly string[];
}

export function derivePlanRequirements(input: DerivePlanRequirementsInput): PlanRequirementsReport {
  const explicit = input.planfile.requirements;
  const requiredPacks = unique([
    ...input.planfile.nodes.flatMap((node) => node.allowed_capability_refs.map(packForCapability).filter(isString)),
    ...(explicit?.packs ?? []).filter((item) => item.required !== false).map((item) => item.id),
  ]);
  const requiredProviders = unique([
    ...requiredProviderKinds(input.planfile),
    ...(explicit?.providers ?? []).filter((item) => item.required !== false).map((item) => item.id),
  ]);
  const requiredCredentials = unique([
    ...requiredCredentialNames(input.planfile),
    ...(explicit?.credentials ?? []).filter((item) => item.required !== false).map((item) => item.ref),
  ]);
  const permissions = unique([...input.planfile.nodes.flatMap(nodePermissions), ...(explicit?.permissions ?? [])]);
  const approvalRequirements = unique([
    ...input.planfile.nodes.flatMap((node) => node.approval_required ? [`${node.id}: ${node.risk_level}`] : []),
    ...(explicit?.approvals ?? []),
  ]);
  const sideEffects = unique(input.planfile.nodes.map(nodeSideEffect).filter(isString));
  const missingPacks = missingPacksFor(requiredPacks, input.available_packs);
  const missingProviders = missingProvidersFor(requiredProviders, input.runtime_profile);
  const missingCredentials = missingCredentialsFor(requiredCredentials, input.runtime_profile);
  const missingPermissions: string[] = [];
  const scheduleInfo = scheduleInfoFor(input.planfile);
  const report = {
    plan_id: input.planfile.plan_id,
    portability_level: portabilityFor(input.planfile, requiredProviders, requiredCredentials),
    required_packs: requiredPacks,
    required_providers: requiredProviders,
    required_credentials: requiredCredentials,
    permissions,
    approval_requirements: approvalRequirements,
    side_effects: sideEffects,
    ...(scheduleInfo ? { schedule_info: scheduleInfo } : {}),
    missing_packs: missingPacks,
    missing_providers: missingProviders,
    missing_credentials: missingCredentials,
    missing_permissions: missingPermissions,
    suggested_commands: suggestedCommands({ missingPacks, missingProviders, missingCredentials, approvalRequirements }),
    warnings: warningsFor(input.planfile, missingPacks, missingProviders, missingCredentials),
  };
  return PlanRequirementsReport.parse(report);
}

function packForCapability(capabilityRef: string): string | undefined {
  if (capabilityRef.startsWith("research.")) return "open-lagrange.research";
  if (capabilityRef.startsWith("repo.")) return "open-lagrange.repository";
  if (capabilityRef.startsWith("chat.")) return "open-lagrange.chat";
  if (capabilityRef.startsWith("skill.")) return "open-lagrange.skills";
  if (capabilityRef.includes(".")) return capabilityRef.split(".").slice(0, -1).join(".");
  return undefined;
}

function requiredProviderKinds(planfile: Planfile): string[] {
  const context = asRecord(planfile.execution_context);
  const parameters = asRecord(context?.parameters);
  const providers: string[] = [];
  if (planfile.nodes.some((node) => node.allowed_capability_refs.includes("research.search_sources"))) {
    const urls = parameters?.urls;
    const providerId = parameters?.provider_id;
    if (!(Array.isArray(urls) && urls.length > 0)) providers.push(typeof providerId === "string" && providerId.length > 0 ? providerId : "search");
  }
  if (planfile.nodes.some((node) => node.allowed_capability_refs.some((capability) => capability.startsWith("repo.")))) providers.push("workspace");
  return unique(providers);
}

function requiredCredentialNames(planfile: Planfile): string[] {
  const context = asRecord(planfile.execution_context);
  const credentials = context?.credentials;
  if (Array.isArray(credentials)) return unique(credentials.filter(isString));
  return [];
}

function nodePermissions(node: PlanNode): string[] {
  const permissions = [`risk:${node.risk_level}`];
  if (node.verification_command_ids?.length) permissions.push("allowlisted_verification_command");
  return permissions;
}

function nodeSideEffect(node: PlanNode): string | undefined {
  if (node.risk_level === "read") return "read";
  if (node.risk_level === "write") return "workspace_or_artifact_write";
  if (node.risk_level === "destructive") return "destructive_workspace_write";
  if (node.risk_level === "external_side_effect") return "external_side_effect";
  return undefined;
}

function missingPacksFor(requiredPacks: readonly string[], availablePacks: readonly string[] | undefined): string[] {
  if (!availablePacks) return [];
  return requiredPacks.filter((pack) => !availablePacks.includes(pack));
}

function missingProvidersFor(requiredProviders: readonly string[], runtimeProfile: RuntimeProfileForRequirements | undefined): string[] {
  return requiredProviders.filter((provider) => {
    if (provider === "workspace") return false;
    if (provider === "search") return !hasLiveSearchProvider(runtimeProfile);
    return !(runtimeProfile?.searchProviders ?? []).some((config) => config.enabled !== false && config.id === provider);
  });
}

function missingCredentialsFor(requiredCredentials: readonly string[], runtimeProfile: RuntimeProfileForRequirements | undefined): string[] {
  if (requiredCredentials.length === 0) return [];
  const refs = runtimeProfile?.secretRefs ?? {};
  return requiredCredentials.filter((credential) => !(credential in refs));
}

function hasLiveSearchProvider(runtimeProfile: RuntimeProfileForRequirements | undefined): boolean {
  return (runtimeProfile?.searchProviders ?? []).some((provider) => provider.enabled !== false && provider.kind !== "fixture");
}

function portabilityFor(planfile: Planfile, requiredProviders: readonly string[], requiredCredentials: readonly string[]): PlanPortabilityLevel {
  const context = asRecord(planfile.execution_context);
  const repository = asRecord(context?.repository);
  const repoRoot = typeof repository?.repo_root === "string" ? repository.repo_root : undefined;
  if (repoRoot && isAbsolute(repoRoot)) return "machine_bound";
  if (requiredCredentials.length > 0 || requiredProviders.some((provider) => provider !== "workspace")) return "profile_bound";
  if (repoRoot || requiredProviders.includes("workspace")) return "workspace_bound";
  return "portable";
}

function scheduleInfoFor(planfile: Planfile): unknown | undefined {
  const context = asRecord(planfile.execution_context);
  return context?.schedule_intent;
}

function suggestedCommands(input: {
  readonly missingPacks: readonly string[];
  readonly missingProviders: readonly string[];
  readonly missingCredentials: readonly string[];
  readonly approvalRequirements: readonly string[];
}): string[] {
  const commands: string[] = [];
  if (input.missingProviders.includes("search")) {
    commands.push("open-lagrange init --runtime podman --with-search");
    commands.push("open-lagrange up --with-search");
  }
  for (const provider of input.missingProviders.filter((value) => value !== "search")) {
    commands.push(`open-lagrange search test-provider ${provider}`);
  }
  if (input.missingPacks.length > 0) commands.push("open-lagrange pack list");
  for (const credential of input.missingCredentials) commands.push(`open-lagrange secrets set ${credential} --from-stdin`);
  if (input.approvalRequirements.length > 0) commands.push("open-lagrange plan apply <planfile>");
  return unique(commands);
}

function warningsFor(planfile: Planfile, missingPacks: readonly string[], missingProviders: readonly string[], missingCredentials: readonly string[]): string[] {
  const warnings: string[] = [];
  if (missingPacks.length > 0) warnings.push(`Missing required pack(s): ${missingPacks.join(", ")}`);
  if (missingProviders.length > 0) warnings.push(`Missing required provider(s): ${missingProviders.join(", ")}`);
  if (missingCredentials.length > 0) warnings.push(`Missing required credential(s): ${missingCredentials.join(", ")}`);
  if (planfile.nodes.some((node) => node.execution_mode === "fixture" || node.execution_mode === "mock")) warnings.push("Planfile contains fixture or mock execution nodes.");
  return warnings;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
