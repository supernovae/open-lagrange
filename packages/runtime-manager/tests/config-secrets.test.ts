import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLocalProfile, loadConfig, saveConfig } from "../src/config.js";
import { getRuntimePaths } from "../src/paths.js";
import { deleteCurrentProfileSecret } from "../src/secrets.js";
import { OsKeychainSecretProvider, SecretManager, setSecretManagerForTests } from "@open-lagrange/core/secrets";

describe("runtime secret config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setSecretManagerForTests(undefined);
  });

  it("serializes refs without raw values", async () => {
    const home = mkdtempSync(join(tmpdir(), "open-lagrange-secrets-"));
    vi.stubEnv("OPEN_LAGRANGE_HOME", home);
    await saveConfig({
      currentProfile: "local",
      profiles: {
        local: defaultLocalProfile({ runtime: "podman" }),
      },
    });

    const text = await readFile(getRuntimePaths().configPath, "utf8");
    expect(text).toContain("secretRefs:");
    expect(text).toContain("workerUrl: http://localhost:4318/healthz");
    expect(text).toContain("activeModelProvider: local");
    expect(text).toContain("modelProviders:");
    expect(text).toContain("local_model");
    expect(text).not.toContain("sk-raw-value");
    expect((await loadConfig()).profiles.local?.secretRefs?.openai).toBeUndefined();
    expect((await loadConfig()).profiles.local?.modelProviders?.local?.api_key_secret_ref).toBe("local_model");
  });

  it("clears token auth when deleting the profile auth secret", async () => {
    const home = mkdtempSync(join(tmpdir(), "open-lagrange-auth-logout-"));
    vi.stubEnv("OPEN_LAGRANGE_HOME", home);
    const store = new Map<string, string>([["profile/local/-/-/api-token", "token-value"]]);
    setSecretManagerForTests(new SecretManager({ providers: [new OsKeychainSecretProvider({
      async getPassword(_service, account) {
        return store.get(account) ?? null;
      },
      async setPassword(_service, account, value) {
        store.set(account, value);
      },
      async deletePassword(_service, account) {
        return store.delete(account);
      },
    })] }));
    const profile = defaultLocalProfile({ runtime: "podman" });
    const tokenRef = {
      ref_id: "os-keychain:profile:local:api-token",
      provider: "os-keychain" as const,
      name: "api-token",
      scope: "profile" as const,
      profile_name: "local",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveConfig({
      currentProfile: "local",
      profiles: {
        local: {
          ...profile,
          auth: { type: "token", tokenRef },
          secretRefs: { open_lagrange_token: tokenRef },
        },
      },
    });

    await deleteCurrentProfileSecret("open_lagrange_token");

    const next = (await loadConfig()).profiles.local;
    expect(next?.auth?.type).toBe("none");
    expect(next?.secretRefs?.open_lagrange_token).toBeUndefined();
  });
});
