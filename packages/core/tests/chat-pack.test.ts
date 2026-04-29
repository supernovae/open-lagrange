import { describe, expect, it } from "vitest";
import { packRegistry } from "../src/capability-registry/registry.js";
import { getCapabilitiesSummary } from "../src/chat-pack/capability-discovery.js";
import { routeIntent } from "../src/chat-pack/intent-router.js";
import { explainSystem } from "../src/chat-pack/system-explainer.js";

describe("Chat Pack", () => {
  it("registers read-only chat capabilities through PackRegistry", () => {
    const capabilities = packRegistry.listCapabilities().filter((capability) => capability.pack_id === "open-lagrange.chat");

    expect(capabilities.map((capability) => capability.name)).toContain("chat.suggest_flow");
    expect(capabilities.every((capability) => capability.risk_level === "read")).toBe(true);
    expect(capabilities.every((capability) => capability.requires_approval === false)).toBe(true);
  });

  it("suggests a repository Planfile flow for developer goals", () => {
    const routed = routeIntent({ text: "add json output to my cli", context: { repo_path: "." } });

    expect(routed.kind).toBe("flow");
    expect(routed.flow?.event).toMatchObject({ type: "plan.create", target: "repo", goal: "add json output to my cli" });
    expect(routed.flow?.requires_confirmation).toBe(true);
  });

  it("suggests a pack build flow for skills files", () => {
    const routed = routeIntent({ text: "build a pack from skills.md" });

    expect(routed.kind).toBe("flow");
    expect(routed.flow?.event).toMatchObject({ type: "pack.build", file: "skills.md" });
  });

  it("summarizes capabilities without exposing secret-shaped values", () => {
    const summary = getCapabilitiesSummary();
    const text = JSON.stringify(summary);

    expect(summary.packs.some((pack) => pack.pack_id === "open-lagrange.chat")).toBe(true);
    expect(text).not.toContain("sk-");
    expect(text).not.toContain("OPENAI_API_KEY=");
  });

  it("explains the system from redacted runtime facts", () => {
    expect(explainSystem(getCapabilitiesSummary())).toContain("typed plans");
  });
});
