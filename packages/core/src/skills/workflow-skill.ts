import { z } from "zod";
import { Planfile } from "../planning/planfile-schema.js";
import { SecretRef } from "../secrets/secret-types.js";
import { RiskLevel } from "../schemas/capabilities.js";

export const WorkflowSkillExample = z.object({
  title: z.string().min(1),
  input: z.string().min(1),
  expected_output: z.string().min(1),
}).strict();

export const WorkflowSkillApprovalPolicy = z.object({
  risk_level: RiskLevel,
  approval_required: z.boolean(),
  requirements: z.array(z.string()),
}).strict();

export const WorkflowSkill = z.object({
  schema_version: z.literal("open-lagrange.workflow-skill.v1"),
  skill_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  required_packs: z.array(z.string().min(1)),
  required_capabilities: z.array(z.string().min(1)),
  required_scopes: z.array(z.string().min(1)),
  required_secret_refs: z.array(SecretRef),
  planfile_template: Planfile,
  approval_policy: WorkflowSkillApprovalPolicy,
  examples: z.array(WorkflowSkillExample),
  created_at: z.string().datetime(),
}).strict();

export type WorkflowSkillExample = z.infer<typeof WorkflowSkillExample>;
export type WorkflowSkillApprovalPolicy = z.infer<typeof WorkflowSkillApprovalPolicy>;
export type WorkflowSkill = z.infer<typeof WorkflowSkill>;
