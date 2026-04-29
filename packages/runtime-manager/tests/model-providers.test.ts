import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureCurrentProfileModelProvider, describeCurrentProfileModelProvider, modelProviderRuntimeEnv } from "../src/model-providers.js";
import { defaultLocalProfile, loadConfig, saveConfig } from "../src/config.js";

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
    const profile = defaultLocalProfile({ runtime: "podman" });
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
});
