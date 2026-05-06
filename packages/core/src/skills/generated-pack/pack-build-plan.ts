import { z } from "zod";
import { RiskLevel, SideEffectKind } from "@open-lagrange/capability-sdk";
import { SecretRef } from "../../secrets/secret-types.js";

export const PackId = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/, "Pack ID must be a safe path segment.");

export const OAuthRequirement = z.object({
  provider_id: z.string().min(1),
  auth_method: z.string().min(1),
  scopes: z.array(z.string().min(1)),
}).strict();

export const NetworkRequirement = z.object({
  allowed_hosts: z.array(z.string().min(1)),
}).strict();

export const FilesystemRequirement = z.object({
  required: z.boolean(),
  access: z.array(z.object({
    kind: z.enum(["read", "write"]),
    paths: z.array(z.string().min(1)),
  }).strict()),
}).strict();

export const ProposedCapability = z.object({
  capability_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
  risk_level: RiskLevel,
  side_effect_kind: SideEffectKind,
  requires_approval: z.boolean(),
  idempotency_mode: z.enum(["required", "recommended", "not_applicable"]),
  timeout_ms: z.number().int().min(1),
  max_attempts: z.number().int().min(1),
  scopes: z.array(z.string().min(1)),
  tags: z.array(z.string().min(1)),
  examples: z.array(z.unknown()),
}).strict();

export const PackBuildPlan = z.object({
  schema_version: z.literal("open-lagrange.pack-build-plan.v1"),
  pack_build_id: z.string().min(1),
  source_skill_id: z.string().min(1),
  pack_id: PackId,
  pack_name: z.string().min(1),
  description: z.string().min(1),
  reason_new_pack_required: z.string().min(1),
  existing_capabilities_reused: z.array(z.string().min(1)),
  missing_capabilities: z.array(z.string().min(1)),
  proposed_capabilities: z.array(ProposedCapability).min(1),
  required_scopes: z.array(z.string().min(1)),
  required_secret_refs: z.array(SecretRef),
  oauth_requirements: z.array(OAuthRequirement),
  network_requirements: NetworkRequirement,
  filesystem_requirements: FilesystemRequirement,
  side_effects: z.array(SideEffectKind),
  risk_level: RiskLevel,
  generation_mode: z.enum(["template_first", "experimental_codegen"]),
  approval_requirements: z.array(z.string().min(1)),
  test_strategy: z.array(z.string().min(1)),
  dry_run_strategy: z.array(z.string().min(1)),
  install_policy: z.object({
    install_requires_validation_pass: z.boolean(),
    manual_review_install_requires_flag: z.boolean(),
    dynamic_loading: z.literal(false),
  }).strict(),
  artifacts: z.array(z.string().min(1)),
  created_at: z.string().datetime(),
}).strict();

export type OAuthRequirement = z.infer<typeof OAuthRequirement>;
export type NetworkRequirement = z.infer<typeof NetworkRequirement>;
export type FilesystemRequirement = z.infer<typeof FilesystemRequirement>;
export type ProposedCapability = z.infer<typeof ProposedCapability>;
export type PackBuildPlan = z.infer<typeof PackBuildPlan>;
