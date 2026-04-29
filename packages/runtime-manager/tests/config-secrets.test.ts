import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLocalProfile, loadConfig, saveConfig } from "../src/config.js";
import { getRuntimePaths } from "../src/paths.js";

describe("runtime secret config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(text).toContain("openai-api-key");
    expect(text).not.toContain("sk-raw-value");
    expect((await loadConfig()).profiles.local?.secretRefs?.openai?.provider).toBe("os-keychain");
  });
});
