import type { SecretAccessContext, SecretRef, SecretRefMetadata, SecretScopeQuery, SecretValue } from "./secret-types.js";

export interface SecretProvider {
  readonly provider: SecretRef["provider"];
  readonly getSecret: (ref: SecretRef, context: SecretAccessContext) => Promise<SecretValue>;
  readonly setSecret: (ref: SecretRef, value: string, context: SecretAccessContext) => Promise<void>;
  readonly deleteSecret: (ref: SecretRef, context: SecretAccessContext) => Promise<void>;
  readonly hasSecret: (ref: SecretRef, context: SecretAccessContext) => Promise<boolean>;
  readonly listSecretRefs?: (scope: SecretScopeQuery) => Promise<readonly SecretRefMetadata[]>;
}
