import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { secretRef } from "@open-lagrange/core/secrets";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureCurrentProfileModelProvider, describeCurrentProfileModelProvider, modelProviderRuntimeEnv } from "../src/model-providers.js";
import { defaultLocalProfile, loadConfig, saveConfig } from "../src/config.js";
import { initRuntime } from "../src/manager.js";
import { credentialStatuses } from "../src/secrets.js";

describe("runtime model providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("configures named provider refs by convention", async () => {
    const home = mkdtempSync(join(tmpdir(), "open-lagrange-model-providers-"));
    vi.stubEnv("OPEN_LAGRANGE_HOME", home);
    await saveConfig({ currentProfile: "local", profiles: { local: defaultLocalProfile({ runtime: "podman" }) } });

    const status = await configureCurrentProfileModelProvider({
      provider: "grok",
      endpoint: "https://api.x.ai/v1",
      model: "grok-2-latest",
      high_model: "grok-2-latest",
      coder_model: "grok-2-latest",
    });

    const config = await loadConfig();
    expect(status.provider).toBe("xai");
    expect(config.profiles.local?.activeModelProvider).toBe("xai");
    expect(config.profiles.local?.secretRefs?.xai?.name).toBe("xai-api-key");
    expect(config.profiles.local?.modelProviders?.xai?.models.default).toBe("grok-2-latest");
  });

  it("projects active provider config into runtime env without requiring raw config values", async () => {
    const profile = {
      ...defaultLocalProfile({ runtime: "podman" }),
      activeModelProvider: "openai",
      secretRefs: {},
      modelProviders: {
        openai: {
          provider: "openai" as const,
          endpoint: "https://api.openai.com/v1",
          api_key_secret_ref: "openai",
          models: { default: "gpt-4o-mini", high: "gpt-4o", coder: "gpt-4o" },
        },
      },
    };
    vi.stubEnv("OPENAI_API_KEY", "sk-test");

    const env = await modelProviderRuntimeEnv(profile);

    expect(env.OPEN_LAGRANGE_MODEL_PROVIDER).toBe("openai");
    expect(env.OPEN_LAGRANGE_MODEL_API_KEY).toBe("sk-test");
    expect(env.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
  });

  it("describes local endpoints as configured without a secret", async () => {
    const home = mkdtempSync(join(tmpdir(), "open-lagrange-local-provider-"));
    vi.stubEnv("OPEN_LAGRANGE_HOME", home);
    await saveConfig({ currentProfile: "local", profiles: { local: defaultLocalProfile({ runtime: "podman" }) } });
    await configureCurrentProfileModelProvider({ provider: "local", endpoint: "http://localhost:1234/v1", model: "local-model" });

    const status = await describeCurrentProfileModelProvider();

    expect(status.provider).toBe("local");
    expect(status.configured).toBe(true);
    expect(status.endpoint).toBe("http://localhost:1234/v1");
  });

  it("reports local endpoints as configured in credential status without a secret", async () => {
    const profile = defaultLocalProfile({ runtime: "podman" });
    const nextProfile = {
      ...profile,
      activeModelProvider: "local",
      secretRefs: {
        ...profile.secretRefs,
        kybern: secretRef({ provider: "os-keychain", name: "kybern-api-key", scope: "profile", profile_name: "local" }),
      },
      modelProviders: {
        ...profile.modelProviders,
        local: {
          provider: "local" as const,
          endpoint: "https://coder.kybern.dev/v1",
          api_key_secret_ref: "kybern",
          models: { default: "core", high: "horizon", coder: "pulse" },
        },
      },
    };

    const status = await credentialStatuses(nextProfile);

    expect(status.modelProvider.state).toBe("running");
    expect(status.modelProvider.detail).toBe("os-keychain");
  });

  it("preserves configured model providers when init regenerates the local profile", async () => {
    const home = mkdtempSync(join(tmpdir(), "open-lagrange-init-preserve-model-"));
    vi.stubEnv("OPEN_LAGRANGE_HOME", home);
    await saveConfig({ currentProfile: "local", profiles: { local: defaultLocalProfile({ runtime: "podman", withSearch: true }) } });
    await configureCurrentProfileModelProvider({
      provider: "local",
      endpoint: "https://coder.kybern.dev/v1",
      model: "core",
      high_model: "horizon",
      coder_model: "pulse",
      secret_ref: "kybern",
    });

    await initRuntime({ runtime: "podman" });

    const profile = (await loadConfig()).profiles.local;
    expect(profile?.activeModelProvider).toBe("local");
    expect(profile?.modelProviders?.local).toMatchObject({
      endpoint: "https://coder.kybern.dev/v1",
      api_key_secret_ref: "kybern",
      models: {
        default: "core",
        high: "horizon",
        coder: "pulse",
      },
    });
    expect(profile?.secretRefs?.kybern?.name).toBe("kybern-api-key");
    expect(profile?.searchProviders?.[0]?.kind).toBe("searxng");
    expect(profile?.modelProviders?.openai).toBeUndefined();
    expect(profile?.secretRefs?.openai).toBeUndefined();
  });
});
