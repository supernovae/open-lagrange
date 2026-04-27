import { describe, expect, it } from "vitest";
import { z } from "zod";
import { capabilityDigest, createPackRegistry, createTestPackContext, type CapabilityPack } from "../src/index.js";

describe("capability SDK registry", () => {
  it("registers packs and rejects duplicate IDs", () => {
    const registry = createPackRegistry().registerPack(testPack("pack.test"));
    expect(registry.getPack("pack.test")).toBeDefined();
    expect(() => registry.registerPack(testPack("pack.test"))).toThrow(/Duplicate pack ID/);
  });

  it("rejects duplicate capability IDs", () => {
    const registry = createPackRegistry().registerPack(testPack("pack.one", "shared.read"));
    expect(() => registry.registerPack(testPack("pack.two", "shared.read"))).toThrow(/Duplicate capability ID/);
  });

  it("generates stable descriptor digests and verifies mismatches", () => {
    const registry = createPackRegistry().registerPack(testPack("pack.digest"));
    const descriptor = registry.resolveCapability({ pack_id: "pack.digest", name: "read_value" });
    expect(descriptor).toBeDefined();
    const { capability_digest: _digest, ...withoutDigest } = descriptor!;
    expect(descriptor?.capability_digest).toBe(capabilityDigest(withoutDigest));
    expect(registry.verifyCapabilityDigest({ capability_id: descriptor?.capability_id }, descriptor?.capability_digest ?? "")).toBe(true);
    expect(registry.verifyCapabilityDigest({ capability_id: descriptor?.capability_id }, "0".repeat(64))).toBe(false);
  });

  it("filters capabilities by scope, risk, and approval metadata", () => {
    const registry = createPackRegistry().registerPack(testPack("pack.filter"));
    expect(registry.listCapabilities({ allowed_scopes: ["scope:read"], max_risk_level: "read" }).map((item) => item.name)).toContain("read_value");
    expect(registry.listCapabilities({ allowed_scopes: ["scope:write"], max_risk_level: "read" })).toHaveLength(0);
    expect(registry.listCapabilities({ allowed_scopes: ["scope:write"], max_risk_level: "write" })[0]?.requires_approval).toBe(true);
  });

  it("validates input and output around execution", async () => {
    const registry = createPackRegistry().registerPack(testPack("pack.execute"));
    const context = createTestPackContext();
    const ok = await registry.executeCapability({ pack_id: "pack.execute", name: "read_value" }, { value: "x" }, context);
    expect(ok.status).toBe("success");
    const badInput = await registry.executeCapability({ pack_id: "pack.execute", name: "read_value" }, { value: 1 }, context);
    expect(badInput.status).toBe("failed");
    const badOutput = await registry.executeCapability({ pack_id: "pack.execute", name: "bad_output" }, { value: "x" }, context);
    expect(badOutput.status).toBe("failed");
  });
});

function testPack(pack_id: string, readCapabilityId = `${pack_id}.read_value`): CapabilityPack {
  return {
    manifest: {
      pack_id,
      name: "Test Pack",
      version: "0.1.0",
      description: "Test pack",
      publisher: "open-lagrange",
      license: "MIT",
      runtime_kind: "mock",
      trust_level: "trusted_core",
      required_scopes: [],
      provided_scopes: ["scope:read", "scope:write"],
      default_policy: {},
      open_cot_alignment: {},
    },
    capabilities: [{
      descriptor: {
        capability_id: readCapabilityId,
        pack_id,
        name: "read_value",
        description: "Read value",
        input_schema: { type: "object" },
        output_schema: { type: "object" },
        risk_level: "read",
        side_effect_kind: "none",
        requires_approval: false,
        idempotency_mode: "recommended",
        timeout_ms: 1000,
        max_attempts: 1,
        scopes: ["scope:read"],
        tags: [],
        examples: [],
      },
      input_schema: z.object({ value: z.string() }).strict(),
      output_schema: z.object({ value: z.string() }).strict(),
      execute: (_context, input) => input,
    }, {
      descriptor: {
        capability_id: `${pack_id}.write_value`,
        pack_id,
        name: "write_value",
        description: "Write value",
        input_schema: { type: "object" },
        output_schema: { type: "object" },
        risk_level: "write",
        side_effect_kind: "filesystem_write",
        requires_approval: true,
        idempotency_mode: "required",
        timeout_ms: 1000,
        max_attempts: 1,
        scopes: ["scope:write"],
        tags: [],
        examples: [],
      },
      input_schema: z.object({ value: z.string() }).strict(),
      output_schema: z.object({ value: z.string() }).strict(),
      execute: (_context, input) => input,
    }, {
      descriptor: {
        capability_id: `${pack_id}.bad_output`,
        pack_id,
        name: "bad_output",
        description: "Bad output",
        input_schema: { type: "object" },
        output_schema: { type: "object" },
        risk_level: "read",
        side_effect_kind: "none",
        requires_approval: false,
        idempotency_mode: "recommended",
        timeout_ms: 1000,
        max_attempts: 1,
        scopes: ["scope:read"],
        tags: [],
        examples: [],
      },
      input_schema: z.object({ value: z.string() }).strict(),
      output_schema: z.object({ value: z.string() }).strict(),
      execute: () => ({ wrong: true }),
    }],
  };
}
