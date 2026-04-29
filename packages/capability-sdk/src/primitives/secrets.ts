import type { PrimitiveContext, PrimitiveSecretRef, SecretAccessContext } from "./context.js";
import { primitiveError } from "./errors.js";

export async function resolveRef(context: PrimitiveContext, ref: PrimitiveSecretRef): Promise<string> {
  if (!context.secret_manager) {
    throw primitiveError("No secret manager is available in this primitive context.", "PRIMITIVE_SECRET_UNAVAILABLE", {
      secret_ref: publicRef(ref),
    });
  }
  return context.secret_manager.resolveSecret(ref, secretAccessContext(context));
}

export async function hasRef(context: PrimitiveContext, ref: PrimitiveSecretRef): Promise<boolean> {
  if (!context.secret_manager) return false;
  if (!context.secret_manager.hasSecret) return true;
  return context.secret_manager.hasSecret(ref, secretAccessContext(context));
}

function secretAccessContext(context: PrimitiveContext): SecretAccessContext {
  return {
    pack_id: context.pack_id,
    capability_id: context.capability_id,
    trace_id: context.trace_id,
    ...(context.plan_id ? { plan_id: context.plan_id } : {}),
    ...(context.node_id ? { node_id: context.node_id } : {}),
    ...(context.task_id ? { task_id: context.task_id } : {}),
  };
}

function publicRef(ref: PrimitiveSecretRef): Record<string, string> {
  return {
    ...(ref.provider ? { provider: ref.provider } : {}),
    name: ref.name,
    ...(ref.scope ? { scope: ref.scope } : {}),
  };
}

export const secrets = {
  resolveRef,
  hasRef,
};
