import { describe, expect, it, vi } from "vitest";
import {
  EnvSecretProvider,
  OsKeychainSecretProvider,
  SecretError,
  SecretManager,
  SecretRef,
  redactSecretRef,
  secretRef,
} from "../src/secrets/index.js";
import type { SecretAccessContext, SecretProvider } from "../src/secrets/index.js";

const now = "2026-04-28T12:00:00.000Z";
const context: SecretAccessContext = {
  principal_id: "human-local",
  delegate_id: "open-lagrange-test",
  profile_name: "local",
  purpose: "runtime",
  trace_id: "trace-test",
};

describe("secrets", () => {
  it("validates SecretRef schema", () => {
    const ref = SecretRef.parse(secretRef({ provider: "env", name: "OPENAI_API_KEY", scope: "profile", profile_name: "local", now }));
    expect(ref.provider).toBe("env");
  });

  it("reads env secrets and rejects writes", async () => {
    vi.stubEnv("OPEN_LAGRANGE_TEST_SECRET", "secret-value");
    const provider = new EnvSecretProvider();
    const ref = secretRef({ provider: "env", name: "OPEN_LAGRANGE_TEST_SECRET", scope: "local", now });
    await expect(provider.getSecret(ref, context)).resolves.toMatchObject({ redacted: "se********ue" });
    await expect(provider.setSecret(ref, "new", context)).rejects.toMatchObject({ code: "SECRET_PROVIDER_READ_ONLY" });
    vi.unstubAllEnvs();
  });

  it("redacts metadata without raw values", () => {
    const ref = secretRef({ provider: "os-keychain", name: "openai-api-key", scope: "profile", profile_name: "local", now });
    expect(JSON.stringify(redactSecretRef(ref, true))).not.toContain("secret-value");
    expect(redactSecretRef(ref, true)).toMatchObject({ configured: true, redacted: "********" });
  });

  it("dispatches through SecretManager providers", async () => {
    const ref = secretRef({ provider: "external", name: "custom", scope: "profile", profile_name: "local", now });
    const provider: SecretProvider = {
      provider: "external",
      getSecret: vi.fn(async () => ({ value: "custom-value", redacted: "cu********ue", metadata: {} })),
      setSecret: vi.fn(async () => undefined),
      deleteSecret: vi.fn(async () => undefined),
      hasSecret: vi.fn(async () => true),
    };
    const manager = new SecretManager({ providers: [provider] });
    await expect(manager.resolveSecret(ref, context)).resolves.toMatchObject({ value: "custom-value" });
    expect(provider.getSecret).toHaveBeenCalledOnce();
  });

  it("returns typed errors for missing secrets", async () => {
    const provider = new EnvSecretProvider();
    const ref = secretRef({ provider: "env", name: "OPEN_LAGRANGE_MISSING_SECRET", scope: "local", now });
    await expect(provider.getSecret(ref, context)).rejects.toBeInstanceOf(SecretError);
    await expect(provider.getSecret(ref, context)).rejects.toMatchObject({ code: "SECRET_MISSING" });
  });

  it("denies raw resolution for model prompt context", async () => {
    vi.stubEnv("OPEN_LAGRANGE_TEST_SECRET", "secret-value");
    const manager = new SecretManager({ providers: [new EnvSecretProvider()] });
    const ref = secretRef({ provider: "env", name: "OPEN_LAGRANGE_TEST_SECRET", scope: "local", now });
    await expect(manager.resolveSecret(ref, { ...context, purpose: "model_prompt" })).rejects.toMatchObject({ code: "SECRET_POLICY_DENIED" });
    vi.unstubAllEnvs();
  });

  it("supports mocked OS keychain provider", async () => {
    const store = new Map<string, string>();
    const provider = new OsKeychainSecretProvider({
      async getPassword(_service, account) {
        return store.get(account) ?? null;
      },
      async setPassword(_service, account, value) {
        store.set(account, value);
      },
      async deletePassword(_service, account) {
        return store.delete(account);
      },
    });
    const ref = secretRef({ provider: "os-keychain", name: "api-token", scope: "profile", profile_name: "local", now });
    await provider.setSecret(ref, "token-value", { ...context, purpose: "secret_write" });
    await expect(provider.hasSecret(ref, context)).resolves.toBe(true);
    await expect(provider.getSecret(ref, context)).resolves.toMatchObject({ value: "token-value" });
  });
});
