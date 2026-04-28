import { SecretError } from "./secret-errors.js";
import type { SecretAccessContext, SecretRef } from "./secret-types.js";

const RAW_ALLOWED_PURPOSES = new Set([
  "runtime",
  "runtime_model_provider",
  "runtime_auth",
  "capability_execution",
  "secret_write",
  "secret_delete",
]);

const RAW_DENIED_PURPOSES = new Set([
  "model_prompt",
  "status",
  "log",
  "tui",
  "cli_status",
  "docs",
]);

export function assertCanResolveRawSecret(ref: SecretRef, context: SecretAccessContext): void {
  if (RAW_DENIED_PURPOSES.has(context.purpose) || !RAW_ALLOWED_PURPOSES.has(context.purpose)) {
    throw new SecretError("SECRET_POLICY_DENIED", `Raw secret access is denied for purpose: ${context.purpose}`, ref);
  }
  if ((ref.scope === "workspace" || ref.scope === "project") && !context.workspace_id && !context.project_id) {
    throw new SecretError("SECRET_POLICY_DENIED", `Scoped secret access requires workspace or project context: ${ref.name}`, ref);
  }
}

export function assertCanMutateSecret(ref: SecretRef, context: SecretAccessContext): void {
  if (context.purpose !== "secret_write" && context.purpose !== "secret_delete" && context.purpose !== "runtime_auth") {
    throw new SecretError("SECRET_POLICY_DENIED", `Secret mutation is denied for purpose: ${context.purpose}`, ref);
  }
}

export function assertCanDescribeSecret(_ref: SecretRef, _context: SecretAccessContext): void {
  return;
}
