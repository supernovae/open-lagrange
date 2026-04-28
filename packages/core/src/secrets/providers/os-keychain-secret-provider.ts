import { missingSecret, providerUnavailable } from "../secret-errors.js";
import type { SecretProvider } from "../secret-provider.js";
import { secretValue } from "../secret-redaction.js";
import type { SecretAccessContext, SecretRef, SecretRefMetadata, SecretScopeQuery } from "../secret-types.js";

const SERVICE = "open-lagrange";

interface KeytarLike {
  readonly getPassword: (service: string, account: string) => Promise<string | null>;
  readonly setPassword: (service: string, account: string, password: string) => Promise<void>;
  readonly deletePassword: (service: string, account: string) => Promise<boolean>;
  readonly findCredentials?: (service: string) => Promise<readonly { readonly account: string; readonly password: string }[]>;
}

export class OsKeychainSecretProvider implements SecretProvider {
  readonly provider = "os-keychain" as const;

  constructor(private readonly keychain?: KeytarLike) {}

  async getSecret(ref: SecretRef, _context: SecretAccessContext) {
    const keychain = await this.loadKeychain();
    const value = await keychain.getPassword(SERVICE, accountFor(ref));
    if (!value) throw missingSecret(ref);
    return secretValue(value, { provider: this.provider, service: SERVICE, account: accountFor(ref) });
  }

  async setSecret(ref: SecretRef, value: string, _context: SecretAccessContext): Promise<void> {
    const keychain = await this.loadKeychain();
    await keychain.setPassword(SERVICE, accountFor(ref), value);
  }

  async deleteSecret(ref: SecretRef, _context: SecretAccessContext): Promise<void> {
    const keychain = await this.loadKeychain();
    await keychain.deletePassword(SERVICE, accountFor(ref));
  }

  async hasSecret(ref: SecretRef, _context: SecretAccessContext): Promise<boolean> {
    const keychain = await this.loadKeychain();
    return Boolean(await keychain.getPassword(SERVICE, accountFor(ref)));
  }

  async listSecretRefs(scope: SecretScopeQuery): Promise<readonly SecretRefMetadata[]> {
    const keychain = await this.loadKeychain();
    if (!keychain.findCredentials) return [];
    const credentials = await keychain.findCredentials(SERVICE);
    return credentials
      .map((credential) => refFromAccount(credential.account))
      .filter((ref): ref is SecretRef => Boolean(ref))
      .filter((ref) => (!scope.scope || ref.scope === scope.scope) && (!scope.profile_name || ref.profile_name === scope.profile_name))
      .map((ref) => ({ ...ref, configured: true, redacted: "********" }));
  }

  private async loadKeychain(): Promise<KeytarLike> {
    if (this.keychain) return this.keychain;
    try {
      const mod = await optionalImportKeytar();
      return mod.default ?? mod;
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      throw providerUnavailable(this.provider, detail);
    }
  }
}

async function optionalImportKeytar(): Promise<KeytarLike & { readonly default?: KeytarLike }> {
  const importer = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<KeytarLike & { readonly default?: KeytarLike }>;
  return importer("keytar");
}

export function accountFor(ref: SecretRef): string {
  return [
    ref.scope,
    ref.profile_name ?? "-",
    ref.workspace_id ?? "-",
    ref.project_id ?? "-",
    ref.name,
  ].join("/");
}

function refFromAccount(account: string): SecretRef | undefined {
  const [scope, profileName, workspaceId, projectId, name] = account.split("/");
  if (!scope || !name) return undefined;
  if (scope !== "local" && scope !== "profile" && scope !== "workspace" && scope !== "project" && scope !== "remote") return undefined;
  return {
    ref_id: `os-keychain:${account}`,
    provider: "os-keychain",
    name,
    scope,
    ...(profileName && profileName !== "-" ? { profile_name: profileName } : {}),
    ...(workspaceId && workspaceId !== "-" ? { workspace_id: workspaceId } : {}),
    ...(projectId && projectId !== "-" ? { project_id: projectId } : {}),
  };
}
