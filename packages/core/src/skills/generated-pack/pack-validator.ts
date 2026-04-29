import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { PackBuildPlan } from "./pack-build-plan.js";
import { runPackChecks, type PackTestReport } from "./pack-test-runner.js";
import { validateStaticSafety, type StaticSafetyReport } from "./static-safety-validator.js";

export const PackValidationReport = z.object({
  pack_id: z.string().min(1),
  status: z.enum(["pass", "fail", "requires_manual_review"]),
  manifest_valid: z.boolean(),
  schemas_valid: z.boolean(),
  static_safety_passed: z.boolean(),
  typescript_compile_passed: z.boolean(),
  tests_passed: z.boolean(),
  dry_run_passed: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  manual_review_items: z.array(z.string()),
  created_at: z.string().datetime(),
}).strict();

export type PackValidationReport = z.infer<typeof PackValidationReport>;

const GeneratedManifest = z.object({
  pack_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  publisher: z.string().min(1),
  license: z.string().min(1),
  trust_level: z.string().min(1),
  runtime_kind: z.string().min(1),
  capabilities: z.array(z.object({
    capability_id: z.string().min(1),
    pack_id: z.string().min(1),
    name: z.string().min(1),
    input_schema: z.record(z.string(), z.unknown()),
    output_schema: z.record(z.string(), z.unknown()),
    risk_level: z.string().min(1),
    side_effect_kind: z.string().min(1),
    requires_approval: z.boolean(),
  }).passthrough()),
  required_scopes: z.array(z.string()),
  provided_scopes: z.array(z.string()).optional(),
  required_secret_refs: z.array(z.unknown()).optional(),
  oauth: z.unknown().optional(),
  network: z.object({ allowed_hosts: z.array(z.string()) }).optional(),
  filesystem: z.unknown().optional(),
  side_effects: z.array(z.string()).optional(),
  approval_requirements: z.array(z.string()).optional(),
  generation_mode: z.enum(["template_first", "experimental_codegen"]).optional(),
}).passthrough();

export function validateGeneratedPack(input: {
  readonly pack_path: string;
  readonly run_checks?: boolean;
  readonly now?: string;
}): PackValidationReport {
  const now = input.now ?? new Date().toISOString();
  const errors: string[] = [];
  const warnings: string[] = [];
  const manual: string[] = [];
  const manifestPath = join(input.pack_path, "open-lagrange.pack.yaml");
  const buildPlanPath = join(input.pack_path, "artifacts", "build-plan.json");
  let packId = basename(input.pack_path);
  let manifestValid = false;
  let schemasValid = false;
  if (!existsSync(manifestPath)) {
    errors.push("open-lagrange.pack.yaml is missing.");
  } else {
    try {
      const manifest = GeneratedManifest.parse(YAML.parse(readFileSync(manifestPath, "utf8")));
      packId = manifest.pack_id;
      manifestValid = true;
      for (const capability of manifest.capabilities) {
        if (capability.pack_id !== manifest.pack_id) errors.push(`${capability.name} pack_id does not match manifest.`);
        if ((capability.risk_level === "write" || capability.risk_level === "destructive" || capability.risk_level === "external_side_effect") && !capability.requires_approval) {
          errors.push(`${capability.name} must require approval for ${capability.risk_level}.`);
        }
      }
      schemasValid = manifest.capabilities.every((capability) => Object.keys(capability.input_schema).length > 0 && Object.keys(capability.output_schema).length > 0);
      if (!schemasValid) errors.push("One or more capabilities are missing schemas.");
    } catch (error) {
      errors.push(`Manifest validation failed: ${message(error)}`);
    }
  }
  if (!existsSync(buildPlanPath)) errors.push("artifacts/build-plan.json is missing.");
  else {
    try {
      PackBuildPlan.parse(JSON.parse(readFileSync(buildPlanPath, "utf8")));
    } catch (error) {
      errors.push(`Build plan validation failed: ${message(error)}`);
    }
  }
  const files = existsSync(input.pack_path) ? walk(input.pack_path).map((path) => path.slice(input.pack_path.length + 1)) : [];
  const safety = validateStaticSafety({ pack_path: input.pack_path, files });
  for (const finding of safety.findings) {
    const text = `${finding.path}: ${finding.message}`;
    if (finding.severity === "error") errors.push(text);
    else manual.push(text);
  }
  const checks = input.run_checks === false ? skippedChecks() : runPackChecks(input.pack_path);
  errors.push(...checks.errors);
  warnings.push(...checks.warnings);
  if (!checks.tests_passed) manual.push("Generated pack tests require review before trust elevation.");
  const status = errors.length > 0
    ? "fail"
    : manual.length > 0
      ? "requires_manual_review"
      : "pass";
  const report = PackValidationReport.parse({
    pack_id: packId,
    status,
    manifest_valid: manifestValid,
    schemas_valid: schemasValid,
    static_safety_passed: safety.passed,
    typescript_compile_passed: checks.typescript_compile_passed,
    tests_passed: checks.tests_passed,
    dry_run_passed: checks.dry_run_passed,
    errors,
    warnings,
    manual_review_items: manual,
    created_at: now,
  });
  const artifactPath = join(input.pack_path, "artifacts", "validation-report.json");
  if (existsSync(join(input.pack_path, "artifacts"))) writeFileSync(artifactPath, JSON.stringify(report, null, 2), "utf8");
  return report;
}

function skippedChecks(): PackTestReport {
  return {
    typescript_compile_passed: false,
    tests_passed: false,
    dry_run_passed: false,
    errors: [],
    warnings: ["TypeScript, test, and dry-run checks were skipped."],
  };
}

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  const stats = statSync(root);
  if (stats.isFile()) return [root];
  return readdirSync(root).flatMap((entry) => walk(join(root, entry)));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
