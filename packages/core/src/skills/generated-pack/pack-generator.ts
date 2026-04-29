import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createCapabilitySnapshotForTask } from "../../capability-registry/registry.js";
import { Planfile } from "../../planning/planfile-schema.js";
import { withCanonicalPlanDigest } from "../../planning/planfile-validator.js";
import { stableHash } from "../../util/hash.js";
import { matchCapabilitiesForSkill } from "../capability-match.js";
import { decideSkillBuild, type SkillBuildDecision } from "../skill-build-decision.js";
import { generateSkillFrame, type SkillFrame } from "../skill-frame.js";
import { parseSkillfileMarkdown } from "../skillfile-parser.js";
import type { ParsedSkillfile } from "../skillfile-schema.js";
import { PackBuildPlan, type PackBuildPlan as PackBuildPlanType, type ProposedCapability } from "./pack-build-plan.js";
import { registerGeneratedPackArtifacts } from "./pack-artifacts.js";
import { writePackScaffold, type PackScaffoldResult } from "./pack-scaffold.js";
import { validateGeneratedPack, type PackValidationReport } from "./pack-validator.js";

export interface GeneratedPackBuildResult {
  readonly status: "generated" | "composed" | "unsupported";
  readonly frame: SkillFrame;
  readonly decision: SkillBuildDecision;
  readonly build_plan?: PackBuildPlanType;
  readonly scaffold?: PackScaffoldResult;
  readonly validation_report?: PackValidationReport;
  readonly planfile?: Planfile;
  readonly artifacts: readonly unknown[];
  readonly message: string;
}

export function scaffoldGeneratedPack(input: {
  readonly pack_id: string;
  readonly output_dir?: string;
  readonly now?: string;
}): PackScaffoldResult {
  const now = input.now ?? new Date().toISOString();
  const slug = slugFrom(input.pack_id.replace(/^local\./, ""));
  const packId = input.pack_id.startsWith("local.") ? input.pack_id : `local.${slug}`;
  const plan = PackBuildPlan.parse({
    schema_version: "open-lagrange.pack-build-plan.v1",
    pack_build_id: `packbuild_${stableHash({ packId, scaffold: true }).slice(0, 18)}`,
    source_skill_id: `skill_${stableHash({ packId }).slice(0, 18)}`,
    pack_id: packId,
    pack_name: titleFrom(slug.replace(/-/g, " ")),
    description: `Reviewable scaffold for ${packId}.`,
    reason_new_pack_required: "Explicit scaffold requested by the user.",
    existing_capabilities_reused: [],
    missing_capabilities: [`Capability required for ${packId}`],
    proposed_capabilities: proposedCapabilities(packId, {
      skill_id: `skill_${stableHash({ packId }).slice(0, 18)}`,
      original_markdown: `# ${packId}`,
      interpreted_goal: `Reviewable scaffold for ${packId}.`,
      triggers: [],
      required_inputs: ["query"],
      expected_outputs: ["summary"],
      side_effects: [],
      required_scopes: [`${slug}:read`],
      required_secrets_as_refs: [],
      existing_pack_matches: [],
      missing_capabilities: [`Capability required for ${packId}`],
      risk_level: "read",
      approval_requirements: [],
      recommended_artifact_type: "capability_pack_required",
      ambiguity: { level: "medium", questions: [], assumptions: ["Scaffold only; fill behavior before install."], blocking: false },
      safety_concerns: [],
      created_at: now,
    }, [`Capability required for ${packId}`]),
    required_scopes: [`${slug}:read`],
    required_secret_refs: [],
    oauth_requirements: [],
    network_requirements: { allowed_hosts: [] },
    filesystem_requirements: { required: false, access: [] },
    side_effects: ["none"],
    risk_level: "read",
    generation_mode: "template_first",
    approval_requirements: [],
    test_strategy: ["Validate manifest", "Compile TypeScript", "Run generated dry-run tests", "Check static safety rules"],
    dry_run_strategy: ["Run capability with mocked context", "Record artifact only"],
    install_policy: {
      install_requires_validation_pass: true,
      manual_review_install_requires_flag: true,
      dynamic_loading: false,
    },
    artifacts: ["artifacts/build-plan.json", "artifacts/validation-report.json"],
    created_at: now,
  });
  return writePackScaffold({ plan, output_dir: resolve(input.output_dir ?? ".open-lagrange/generated-packs") });
}

export async function buildGeneratedPackFromMarkdown(input: {
  readonly markdown: string;
  readonly output_dir?: string;
  readonly dry_run?: boolean;
  readonly experimental_codegen?: boolean;
  readonly now?: string;
}): Promise<GeneratedPackBuildResult> {
  const skillfile = parseSkillfileMarkdown(input.markdown);
  return buildGeneratedPack({ skillfile, ...input });
}

export async function buildGeneratedPack(input: {
  readonly skillfile: ParsedSkillfile;
  readonly output_dir?: string;
  readonly dry_run?: boolean;
  readonly experimental_codegen?: boolean;
  readonly now?: string;
}): Promise<GeneratedPackBuildResult> {
  const now = input.now ?? new Date().toISOString();
  const frame = await generateSkillFrame({ skillfile: input.skillfile, now });
  const snapshot = createCapabilitySnapshotForTask({ max_risk_level: frame.risk_level, now });
  const capabilityMatches = matchCapabilitiesForSkill({ frame, capability_snapshot: snapshot });
  const decision = decideSkillBuild({ frame, capability_matches: capabilityMatches });
  if (decision.decision === "unsupported") {
    return { status: "unsupported", frame, decision, artifacts: [], message: decision.summary };
  }
  if (decision.decision !== "capability_pack_required") {
    return { status: "composed", frame, decision, artifacts: [], message: "Existing capability packs can satisfy this skill; no generated pack was created." };
  }
  const buildPlan = createPackBuildPlan({ frame, decision, experimental_codegen: input.experimental_codegen ?? false, now });
  const outputDir = resolve(input.output_dir ?? ".open-lagrange/generated-packs");
  const scaffold = writePackScaffold({ plan: buildPlan, output_dir: outputDir });
  const validation = validateGeneratedPack({ pack_path: scaffold.pack_path, now });
  const artifacts = registerGeneratedPackArtifacts({ pack_path: scaffold.pack_path, plan: buildPlan, validation_report: validation, now });
  const planfile = createPackBuildPlanfile(buildPlan, now);
  const planPath = `${scaffold.pack_path}/artifacts/pack-planfile.json`;
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, JSON.stringify(planfile, null, 2), "utf8");
  return {
    status: "generated",
    frame,
    decision,
    build_plan: buildPlan,
    scaffold,
    validation_report: validation,
    planfile,
    artifacts,
    message: input.dry_run === false ? "Generated pack source. Install is still explicit." : "Generated pack source for dry-run review.",
  };
}

export function createPackBuildPlan(input: {
  readonly frame: SkillFrame;
  readonly decision: SkillBuildDecision;
  readonly experimental_codegen: boolean;
  readonly now?: string;
}): PackBuildPlanType {
  const now = input.now ?? new Date().toISOString();
  const title = markdownTitle(input.frame.original_markdown) ?? input.frame.interpreted_goal;
  const slug = slugFrom(title);
  const packId = `local.${slug}`;
  const capabilities = proposedCapabilities(packId, input.frame, input.decision.missing_capabilities);
  const hosts = allowedHosts(input.frame.original_markdown);
  const oauth = oauthRequirements(input.frame.original_markdown);
  return PackBuildPlan.parse({
    schema_version: "open-lagrange.pack-build-plan.v1",
    pack_build_id: `packbuild_${stableHash({ skill_id: input.frame.skill_id, packId }).slice(0, 18)}`,
    source_skill_id: input.frame.skill_id,
    pack_id: packId,
    pack_name: titleFrom(title),
    description: input.frame.interpreted_goal,
    reason_new_pack_required: input.decision.summary,
    existing_capabilities_reused: input.decision.capability_matches.matches.map((match) => match.capability_ref),
    missing_capabilities: input.decision.missing_capabilities,
    proposed_capabilities: capabilities,
    required_scopes: input.frame.required_scopes.length > 0 ? input.frame.required_scopes : [`${slug}:read`],
    required_secret_refs: input.frame.required_secrets_as_refs,
    oauth_requirements: oauth,
    network_requirements: { allowed_hosts: hosts },
    filesystem_requirements: filesystem(input.frame),
    side_effects: [...new Set(capabilities.map((capability) => capability.side_effect_kind))],
    risk_level: input.frame.risk_level,
    generation_mode: input.experimental_codegen ? "experimental_codegen" : "template_first",
    approval_requirements: input.frame.approval_requirements,
    test_strategy: ["Validate manifest", "Compile TypeScript", "Run generated dry-run tests", "Check static safety rules"],
    dry_run_strategy: ["Run capability with mocked context", "Record artifact only", "Do not contact undeclared hosts"],
    install_policy: {
      install_requires_validation_pass: true,
      manual_review_install_requires_flag: true,
      dynamic_loading: false,
    },
    artifacts: ["artifacts/build-plan.json", "artifacts/validation-report.json"],
    created_at: now,
  });
}

function proposedCapabilities(packId: string, frame: SkillFrame, missing: readonly string[]): ProposedCapability[] {
  const items = missing.length > 0 ? missing : [frame.interpreted_goal];
  return items.slice(0, 3).map((item, index) => {
    const name = safeName(item, index);
    const risky = frame.risk_level !== "read";
    return {
      capability_id: `${packId}.${name}`,
      name,
      description: item,
      input_schema: { type: "object", required: ["query"], properties: { query: { type: "string" }, dry_run: { type: "boolean" } }, additionalProperties: false },
      output_schema: { type: "object", required: ["summary", "dry_run"], properties: { summary: { type: "string" }, dry_run: { type: "boolean" } }, additionalProperties: false },
      risk_level: frame.risk_level,
      side_effect_kind: frame.risk_level === "read" ? "none" : frame.risk_level === "write" ? "filesystem_write" : frame.risk_level === "external_side_effect" ? "network_write" : "cloud_control_plane",
      requires_approval: risky,
      idempotency_mode: risky ? "required" : "recommended",
      timeout_ms: 5000,
      max_attempts: 1,
      scopes: frame.required_scopes.length > 0 ? frame.required_scopes : [`${packId.replace(/^local\./, "")}:read`],
      tags: ["generated", "primitive:artifact"],
      examples: [{ input: { query: "status", dry_run: true }, output: { summary: "status", dry_run: true } }],
    };
  });
}

function createPackBuildPlanfile(plan: PackBuildPlanType, now: string): Planfile {
  return withCanonicalPlanDigest(Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id: `plan_${stableHash(plan.pack_build_id).slice(0, 18)}`,
    goal_frame: {
      goal_id: `goal_${stableHash(plan.source_skill_id).slice(0, 18)}`,
      original_prompt: plan.description,
      interpreted_goal: `Generate ${plan.pack_name}`,
      acceptance_criteria: ["Generated pack source exists.", "Validation report is produced.", "Install requires explicit user action."],
      non_goals: ["Dynamically load generated code.", "Install generated packs automatically."],
      assumptions: ["Generated source is untrusted until validation and explicit install."],
      ambiguity: { level: "low", questions: [], blocking: false },
      suggested_mode: "dry_run",
      risk_notes: plan.approval_requirements,
      created_at: now,
    },
    mode: "dry_run",
    status: "draft",
    nodes: [
      node("frame_skill", "frame", "Frame skill", "Create SkillFrame"),
      node("match_capabilities", "inspect", "Match capabilities", "Compare with PackRegistry", ["frame_skill"]),
      node("design_pack", "design", "Design pack", "Create PackBuildPlan", ["match_capabilities"]),
      node("generate_scaffold", "patch", "Generate scaffold", "Write generated pack source", ["design_pack"]),
      node("validate_pack", "verify", "Validate pack", "Run static and TypeScript checks", ["generate_scaffold"]),
      node("review_pack", "review", "Review pack", "Summarize install readiness", ["validate_pack"]),
    ],
    edges: [
      { from: "frame_skill", to: "match_capabilities", reason: "skill frame before matching" },
      { from: "match_capabilities", to: "design_pack", reason: "missing capabilities before design" },
      { from: "design_pack", to: "generate_scaffold", reason: "plan before source" },
      { from: "generate_scaffold", to: "validate_pack", reason: "source before validation" },
      { from: "validate_pack", to: "review_pack", reason: "validation before review" },
    ],
    approval_policy: { require_approval_for_risks: ["write", "destructive", "external_side_effect"] },
    verification_policy: { allowed_command_ids: ["generated_pack_validate"] },
    artifact_refs: [],
    created_at: now,
    updated_at: now,
  }));
}

function node(id: string, kind: Planfile["nodes"][number]["kind"], title: string, objective: string, depends_on: readonly string[] = []): Planfile["nodes"][number] {
  return {
    id,
    kind,
    title,
    objective,
    description: objective,
    depends_on: [...depends_on],
    allowed_capability_refs: [],
    expected_outputs: [`${title} artifact`],
    acceptance_refs: ["acceptance:1"],
    risk_level: kind === "patch" ? "write" : "read",
    approval_required: kind === "patch",
    status: "pending",
    artifacts: [],
    errors: [],
  };
}

function filesystem(frame: SkillFrame): PackBuildPlanType["filesystem_requirements"] {
  const needsWrite = frame.side_effects.some((item) => item.includes("write") || item.includes("delete"));
  return { required: needsWrite, access: needsWrite ? [{ kind: "write", paths: ["workspace"] }] : [] };
}

function oauthRequirements(markdown: string): PackBuildPlanType["oauth_requirements"] {
  const text = markdown.toLowerCase();
  if (!text.includes("github")) return [];
  return [{ provider_id: "github", auth_method: "device_flow", scopes: ["repo:read"] }];
}

function allowedHosts(markdown: string): string[] {
  const hosts = [...markdown.matchAll(/https?:\/\/([^/\s)]+)/g)]
    .map((match) => match[1]?.replace(/[`"'.,;:]+$/g, ""))
    .filter((value): value is string => Boolean(value));
  if (markdown.toLowerCase().includes("github")) hosts.push("api.github.com");
  return [...new Set(hosts)];
}

function slugFrom(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "generated-pack";
}

function safeName(value: string, index: number): string {
  const normalized = value.toLowerCase().replace(/^capability required for/i, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return normalized && /^[a-z]/.test(normalized) ? normalized : `capability_${index + 1}`;
}

function titleFrom(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 80) || "Generated Capability Pack";
}

function markdownTitle(value: string): string | undefined {
  const line = value.split(/\r?\n/).find((item) => /^#\s+/.test(item));
  return line?.replace(/^#\s+/, "").trim() || undefined;
}
