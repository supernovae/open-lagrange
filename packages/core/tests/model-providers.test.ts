import { describe, expect, it } from "vitest";
import { getModelProviderDescriptor, listModelProviderDescriptors, modelForRole, modelProviderSecretName, normalizeModelProviderId } from "../src/model-providers/index.js";

describe("model providers", () => {
  it("lists named providers and aliases common names", () => {
    const ids = listModelProviderDescriptors().map((item) => item.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("kimi");
    expect(ids).toContain("xai");
    expect(ids).toContain("local");
    expect(normalizeModelProviderId("gpt")).toBe("openai");
    expect(normalizeModelProviderId("grok")).toBe("xai");
    expect(normalizeModelProviderId("fireworks.ai")).toBe("fireworks");
    expect(normalizeModelProviderId("toegther")).toBe("together");
  });

  it("describes secret conventions without raw values", () => {
    expect(modelProviderSecretName("openrouter")).toBe("openrouter-api-key");
    expect(getModelProviderDescriptor("local").api_key_env).toBeUndefined();
  });

  it("falls back to higher model slots for coding roles", () => {
    expect(modelForRole("coder", { default: "default-model", high: "high-model" }, { default: "suggested" })).toBe("high-model");
  });
});
