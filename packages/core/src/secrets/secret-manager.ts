import { SecretError, missingSecret } from "./secret-errors.js";
import type { SecretProvider } from "./secret-provider.js";
import { redactSecretRef } from "./secret-redaction.js";
import { assertCanDescribeSecret, assertCanMutateSecret, assertCanResolveRawSecret } from "./secret-policy.js";
import { SecretAccessContext, SecretRef, type SecretRefMetadata, type SecretValue } from "./secret-types.js";
import { EnvSecretProvider } from "./providers/env-secret-provider.js";
import { OsKeychainSecretProvider } from "./providers/os-keychain-secret-provider.js";

export interface SecretManagerOptions {
  readonly providers?: readonly SecretProvider[];
}

export class SecretManager {
  private readonly providers: Map<SecretRef["provider"], SecretProvider>;

  constructor(options: SecretManagerOptions = {}) {
    const providers = options.providers ?? [new EnvSecretProvider(), new OsKeychainSecretProvider()];
    this.providers = new Map(providers.map((provider) => [provider.provider, provider]));
  }

  async resolveSecret(refInput: SecretRef, contextInput: SecretAccessContext): Promise<SecretValue> {
    const ref = SecretRef.parse(refInput);
    const context = SecretAccessContext.parse(contextInput);
    assertCanResolveRawSecret(ref, context);
    return this.providerFor(ref).getSecret(ref, context);
  }

  async setSecret(refInput: SecretRef, value: string, contextInput: SecretAccessContext): Promise<void> {
    const ref = SecretRef.parse(refInput);
    const context = SecretAccessContext.parse(contextInput);
    assertCanMutateSecret(ref, context);
    await this.providerFor(ref).setSecret(ref, value, context);
  }

  async deleteSecret(refInput: SecretRef, contextInput: SecretAccessContext): Promise<void> {
    const ref = SecretRef.parse(refInput);
    const context = SecretAccessContext.parse(contextInput);
    assertCanMutateSecret(ref, context);
    await this.providerFor(ref).deleteSecret(ref, context);
  }

  async hasSecret(refInput: SecretRef, contextInput: SecretAccessContext): Promise<boolean> {
    const ref = SecretRef.parse(refInput);
    const context = SecretAccessContext.parse(contextInput);
    assertCanDescribeSecret(ref, context);
    try {
      return await this.providerFor(ref).hasSecret(ref, context);
    } catch (error) {
      if (error instanceof SecretError && error.code === "SECRET_PROVIDER_UNAVAILABLE") return false;
      throw error;
    }
  }

  async describeSecret(refInput: SecretRef, contextInput: SecretAccessContext): Promise<SecretRefMetadata> {
    const ref = SecretRef.parse(refInput);
    const context = SecretAccessContext.parse(contextInput);
    assertCanDescribeSecret(ref, context);
    return redactSecretRef(ref, await this.hasSecret(ref, context));
  }

  private providerFor(ref: SecretRef): SecretProvider {
    const provider = this.providers.get(ref.provider);
    if (!provider) throw new SecretError("SECRET_PROVIDER_UNKNOWN", `Secret provider is not registered: ${ref.provider}`, ref);
    return provider;
  }
}

let defaultSecretManager: SecretManager | undefined;

export function getSecretManager(): SecretManager {
  defaultSecretManager ??= new SecretManager();
  return defaultSecretManager;
}

export function setSecretManagerForTests(manager: SecretManager | undefined): void {
  defaultSecretManager = manager;
}

export async function resolveFirstAvailableSecret(input: {
  readonly refs: readonly SecretRef[];
  readonly context: SecretAccessContext;
}): Promise<SecretValue> {
  let latest: unknown;
  for (const ref of input.refs) {
    try {
      return await getSecretManager().resolveSecret(ref, input.context);
    } catch (error) {
      latest = error;
    }
  }
  const first = input.refs[0];
  if (first) throw latest instanceof Error ? latest : missingSecret(first);
  throw new SecretError("SECRET_MISSING", "No secret refs were provided.");
}
