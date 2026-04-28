import { z } from "zod";

export const SecretProviderKind = z.enum(["os-keychain", "env", "vault", "external"]);
export const SecretScope = z.enum(["local", "profile", "workspace", "project", "remote"]);

export const SecretRef = z.object({
  ref_id: z.string().min(1),
  provider: SecretProviderKind,
  name: z.string().min(1),
  scope: SecretScope,
  profile_name: z.string().min(1).optional(),
  workspace_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  description: z.string().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
}).strict();

export const SecretRefMetadata = SecretRef.extend({
  configured: z.boolean(),
  redacted: z.string(),
}).strict();

export const SecretValue = z.object({
  value: z.string().min(1),
  redacted: z.string(),
  metadata: z.record(z.string(), z.unknown()),
}).strict();

export const SecretAccessContext = z.object({
  principal_id: z.string().min(1),
  delegate_id: z.string().min(1),
  profile_name: z.string().min(1),
  workspace_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  purpose: z.string().min(1),
  capability_ref: z.string().min(1).optional(),
  trace_id: z.string().min(1),
}).strict();

export const SecretScopeQuery = z.object({
  provider: SecretProviderKind.optional(),
  scope: SecretScope.optional(),
  profile_name: z.string().min(1).optional(),
  workspace_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
}).strict();

export type SecretProviderKind = z.infer<typeof SecretProviderKind>;
export type SecretScope = z.infer<typeof SecretScope>;
export type SecretRef = z.infer<typeof SecretRef>;
export type SecretRefMetadata = z.infer<typeof SecretRefMetadata>;
export type SecretValue = z.infer<typeof SecretValue>;
export type SecretAccessContext = z.infer<typeof SecretAccessContext>;
export type SecretScopeQuery = z.infer<typeof SecretScopeQuery>;

export function secretRef(input: {
  readonly provider: SecretProviderKind;
  readonly name: string;
  readonly scope: SecretScope;
  readonly profile_name?: string;
  readonly workspace_id?: string;
  readonly project_id?: string;
  readonly description?: string;
  readonly now?: string;
}): SecretRef {
  const now = input.now ?? new Date().toISOString();
  const scoped = [
    input.scope,
    input.profile_name,
    input.workspace_id,
    input.project_id,
    input.name,
  ].filter(Boolean).join(":");
  return SecretRef.parse({
    ref_id: `${input.provider}:${scoped}`,
    provider: input.provider,
    name: input.name,
    scope: input.scope,
    ...(input.profile_name ? { profile_name: input.profile_name } : {}),
    ...(input.workspace_id ? { workspace_id: input.workspace_id } : {}),
    ...(input.project_id ? { project_id: input.project_id } : {}),
    ...(input.description ? { description: input.description } : {}),
    created_at: now,
    updated_at: now,
  });
}
