import { missingSecret, readOnlyProvider } from "../secret-errors.js";
import type { SecretProvider } from "../secret-provider.js";
import { secretValue } from "../secret-redaction.js";
import type { SecretAccessContext, SecretRef, SecretRefMetadata, SecretScopeQuery } from "../secret-types.js";

export class EnvSecretProvider implements SecretProvider {
  readonly provider = "env" as const;

  async getSecret(ref: SecretRef, _context: SecretAccessContext) {
    const value = process.env[ref.name];
    if (!value) throw missingSecret(ref);
    return secretValue(value, { provider: this.provider, env_name: ref.name });
  }

  async setSecret(_ref: SecretRef, _value: string, _context: SecretAccessContext): Promise<void> {
    throw readOnlyProvider(this.provider);
  }

  async deleteSecret(_ref: SecretRef, _context: SecretAccessContext): Promise<void> {
    throw readOnlyProvider(this.provider);
  }

  async hasSecret(ref: SecretRef, _context: SecretAccessContext): Promise<boolean> {
    return Boolean(process.env[ref.name]);
  }

  async listSecretRefs(scope: SecretScopeQuery): Promise<readonly SecretRefMetadata[]> {
    if (scope.provider && scope.provider !== this.provider) return [];
    return [];
  }
}
