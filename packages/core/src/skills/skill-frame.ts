import { generateObject } from "ai";
import { z } from "zod";
import { createConfiguredLanguageModel } from "../model-providers/index.js";
import { stableHash } from "../util/hash.js";
import { RiskLevel } from "../schemas/capabilities.js";
import { SecretRef } from "../secrets/secret-types.js";
import { stripSecretValue } from "../secrets/secret-redaction.js";
import type { ParsedSkillfile } from "./skillfile-schema.js";
import { sectionBody } from "./skillfile-parser.js";

export const RecommendedSkillArtifactType = z.enum(["workflow_skill", "capability_pack_required", "prompt_template", "unsupported"]);

export const SkillAmbiguity = z.object({
  level: z.enum(["low", "medium", "high"]),
  questions: z.array(z.string()),
  assumptions: z.array(z.string()),
  blocking: z.boolean(),
}).strict();

export const SkillFrame = z.object({
  skill_id: z.string().min(1),
  original_markdown: z.string().min(1),
  interpreted_goal: z.string().min(1),
  triggers: z.array(z.string()),
  required_inputs: z.array(z.string()),
  expected_outputs: z.array(z.string()),
  side_effects: z.array(z.string()),
  required_scopes: z.array(z.string()),
  required_secrets_as_refs: z.array(SecretRef),
  existing_pack_matches: z.array(z.string()),
  missing_capabilities: z.array(z.string()),
  risk_level: RiskLevel,
  approval_requirements: z.array(z.string()),
  recommended_artifact_type: RecommendedSkillArtifactType,
  ambiguity: SkillAmbiguity,
  safety_concerns: z.array(z.string()),
  created_at: z.string().datetime(),
}).strict();

export type RecommendedSkillArtifactType = z.infer<typeof RecommendedSkillArtifactType>;
export type SkillFrame = z.infer<typeof SkillFrame>;

export async function generateSkillFrame(input: {
  readonly skillfile: ParsedSkillfile;
  readonly now?: string;
}): Promise<SkillFrame> {
  const now = input.now ?? new Date().toISOString();
  const model = createConfiguredLanguageModel("high");
  if (!model) return deterministicSkillFrame(input.skillfile, now);
  const { object } = await generateObject({
    model,
    schema: SkillFrame,
    system: [
      "Emit a SkillFrame only.",
      "Do not execute tools or capabilities.",
      "Do not produce executable scripts.",
      "Use only typed secret references, never raw secret values.",
      "Unsafe or missing capabilities must be explicit.",
    ].join("\n"),
    prompt: JSON.stringify(stripSecretValue({ skillfile: input.skillfile, now })),
  });
  return SkillFrame.parse(object);
}

export function deterministicSkillFrame(skillfile: ParsedSkillfile, now: string): SkillFrame {
  const goal = firstLine(sectionBody(skillfile, "goal") ?? skillfile.title ?? skillfile.unsectioned_body) || "Workflow skill";
  const inputs = listFrom(sectionBody(skillfile, "inputs"));
  const outputs = listFrom(sectionBody(skillfile, "outputs"));
  const tools = listFrom(sectionBody(skillfile, "tools"));
  const permissions = listFrom(sectionBody(skillfile, "permissions"));
  const secrets = listFrom(sectionBody(skillfile, "secrets"));
  const approval = listFrom(sectionBody(skillfile, "approval"));
  const constraints = listFrom(sectionBody(skillfile, "constraints"));
  const rules = listFrom(sectionBody(skillfile, "rules"));
  const text = skillfile.original_markdown.toLowerCase();
  const sideEffects = sideEffectsFrom(text, permissions);
  const risk = riskFrom(sideEffects, permissions);
  const secretRefs = secrets.map((name) => secretRefFromText(name, now));
  const unsafe = unsafeConcerns(text);
  const missing = tools
    .filter((tool) => !knownToolHint(tool))
    .map((tool) => `Capability required for ${tool}`);
  return SkillFrame.parse({
    skill_id: `skill_${stableHash({ goal, markdown: skillfile.original_markdown }).slice(0, 18)}`,
    original_markdown: skillfile.original_markdown,
    interpreted_goal: goal,
    triggers: listFrom(sectionBody(skillfile, "triggers")),
    required_inputs: inputs.length > 0 ? inputs : ["User-provided workflow input"],
    expected_outputs: outputs.length > 0 ? outputs : ["Workflow result artifact"],
    side_effects: sideEffects,
    required_scopes: scopesFrom(risk, permissions),
    required_secrets_as_refs: secretRefs,
    existing_pack_matches: [],
    missing_capabilities: missing,
    risk_level: risk,
    approval_requirements: approval.length > 0 ? approval : approvalRequirements(risk, sideEffects),
    recommended_artifact_type: unsafe.length > 0 ? "unsupported" : missing.length > 0 ? "capability_pack_required" : "workflow_skill",
    ambiguity: {
      level: inputs.length === 0 || outputs.length === 0 ? "medium" : "low",
      questions: [
        ...(inputs.length === 0 ? ["What inputs should the workflow require?"] : []),
        ...(outputs.length === 0 ? ["What output artifact should the workflow produce?"] : []),
      ],
      assumptions: [
        ...constraints,
        ...rules,
        ...(tools.length === 0 ? ["No specific capability tools were listed."] : []),
      ],
      blocking: false,
    },
    safety_concerns: unsafe,
    created_at: now,
  });
}

function listFrom(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/\r?\n|,/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function firstLine(value: string | undefined): string {
  return (value ?? "").split(/\r?\n/).map((line) => line.replace(/^#\s+/, "").trim()).find(Boolean) ?? "";
}

function sideEffectsFrom(text: string, permissions: readonly string[]): string[] {
  const joined = `${text}\n${permissions.join("\n")}`;
  return [
    joined.match(/\b(write|modify|patch|create|update)\b/) ? "write" : undefined,
    joined.match(/\b(delete|remove|destroy)\b/) ? "delete" : undefined,
    joined.match(/\b(send|email|post|publish|webhook|api|network|external)\b/) ? "external_side_effect" : undefined,
  ].filter((item): item is string => Boolean(item));
}

function riskFrom(sideEffects: readonly string[], permissions: readonly string[]): SkillFrame["risk_level"] {
  const joined = permissions.join("\n").toLowerCase();
  if (sideEffects.includes("delete") || joined.includes("destructive")) return "destructive";
  if (sideEffects.includes("external_side_effect")) return "external_side_effect";
  if (sideEffects.includes("write")) return "write";
  return "read";
}

function scopesFrom(risk: SkillFrame["risk_level"], permissions: readonly string[]): string[] {
  const scopes = new Set(permissions.filter((item) => item.includes(":")));
  if (risk === "read") scopes.add("project:read");
  if (risk === "write" || risk === "destructive") scopes.add("project:write");
  if (risk === "external_side_effect") scopes.add("project:write");
  return [...scopes];
}

function approvalRequirements(risk: SkillFrame["risk_level"], sideEffects: readonly string[]): string[] {
  if (risk === "read" && sideEffects.length === 0) return [];
  return [`Approval required for ${risk} workflow behavior.`];
}

function secretRefFromText(value: string, now: string): SecretRef {
  const name = value.replace(/.*?:/, "").trim().replace(/`/g, "") || "workflow-secret";
  const safe = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "workflow-secret";
  return SecretRef.parse({
    ref_id: `external:workflow:${safe}`,
    provider: "external",
    name: safe,
    scope: "project",
    description: `Secret reference for ${safe}`,
    created_at: now,
    updated_at: now,
  });
}

function knownToolHint(value: string): boolean {
  const text = value.toLowerCase();
  return ["repo", "repository", "file", "read", "search", "patch", "verify", "review", "mock"].some((hint) => text.includes(hint));
}

function unsafeConcerns(text: string): string[] {
  return [
    text.includes("bypass approval") ? "Requests bypassing approval." : undefined,
    text.includes("raw secret") ? "Requests raw secret exposure." : undefined,
    text.includes("shell script") || text.includes("bash script") ? "Requests executable script generation." : undefined,
  ].filter((item): item is string => Boolean(item));
}
