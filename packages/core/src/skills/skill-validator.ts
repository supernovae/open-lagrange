import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import { validatePlanfile } from "../planning/planfile-validator.js";
import { stripSecretValue } from "../secrets/secret-redaction.js";
import { WorkflowSkill, type WorkflowSkill as WorkflowSkillType } from "./workflow-skill.js";

export interface SkillValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface SkillValidationOptions {
  readonly capability_snapshot?: CapabilitySnapshot;
}

export function validateWorkflowSkill(input: unknown, options: SkillValidationOptions = {}): SkillValidationResult {
  const errors: string[] = [];
  const parsed = WorkflowSkill.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  const skill = parsed.data;
  const redacted = JSON.stringify(stripSecretValue(skill));
  if (containsExecutableScript(skill)) errors.push("WorkflowSkill must not include arbitrary executable script content.");
  if (containsRawSecretValue(skill)) errors.push("WorkflowSkill must use secret refs, not raw secret values.");
  if (redacted.includes("sk-") || redacted.includes("-----BEGIN")) errors.push("WorkflowSkill contains secret-looking material.");
  if ((skill.approval_policy.risk_level !== "read" || skill.planfile_template.nodes.some((node) => node.risk_level !== "read")) && !skill.approval_policy.approval_required) {
    errors.push("WorkflowSkill requires approval for side effects.");
  }
  const planValidation = validatePlanfile(skill.planfile_template, options.capability_snapshot ? { capability_snapshot: options.capability_snapshot } : {});
  for (const issue of planValidation.issues.filter((issue) => issue.severity === "error")) errors.push(`Planfile: ${issue.message}`);
  if (options.capability_snapshot) {
    const refs = capabilityReferenceSet(options.capability_snapshot);
    for (const capability of skill.required_capabilities) {
      if (!refs.has(capability)) errors.push(`Unknown required capability: ${capability}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function containsExecutableScript(skill: WorkflowSkillType): boolean {
  const text = JSON.stringify(skill).toLowerCase();
  return /\b(shell script|bash script|chmod \+x|#!\/bin\/|powershell|curl\s+\S+\s*\|)\b/.test(text);
}

function containsRawSecretValue(skill: WorkflowSkillType): boolean {
  const text = JSON.stringify(skill);
  return /(api[_-]?key|token|secret)["']?\s*[:=]\s*["'][^"']{12,}/i.test(text);
}

function capabilityReferenceSet(snapshot: CapabilitySnapshot): Set<string> {
  const refs = new Set<string>();
  for (const capability of snapshot.capabilities) {
    refs.add(capability.capability_name);
    refs.add(`${capability.endpoint_id}.${capability.capability_name}`);
    refs.add(`${capability.endpoint_id}.${capability.capability_name}@${capability.capability_digest}`);
  }
  return refs;
}
