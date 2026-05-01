import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestPackContext } from "@open-lagrange/capability-sdk";
import { packRegistry } from "../src/capability-registry/registry.js";
import { buildCapabilitySnapshot } from "../src/schemas/capabilities.js";
import { validateCapabilityPack } from "../src/packs/pack-validator.js";
import { routeIntent } from "../src/chat-pack/intent-router.js";
import { matchCapabilitiesForSkill } from "../src/skills/capability-match.js";
import { deterministicSkillFrame } from "../src/skills/skill-frame.js";
import { parseSkillfileMarkdown } from "../src/skills/skillfile-parser.js";
import { researchPack, researchWorkflowCapabilityRefs, researchWorkflowTemplates, runResearchBriefCommand, runResearchFetchCommand, runResearchFetchSource, runResearchSearch, runResearchSearchCommand, runResearchSummarizeUrlCommand, stripHtml } from "../src/capability-packs/research/index.js";

const now = "2026-04-29T12:00:00.000Z";

describe("research pack", () => {
  it("validates manifest and descriptors", () => {
    const validation = validateCapabilityPack(researchPack);
    const capabilities = packRegistry.listCapabilities({}).filter((capability) => capability.pack_id === "open-lagrange.research");

    expect(validation.ok).toBe(true);
    expect(capabilities.map((capability) => capability.name)).toContain("research.create_brief");
  });

  it("returns deterministic fixture search results", async () => {
    const artifacts: unknown[] = [];
    const result = await runResearchSearch(createTestPackContext({ async recordArtifact(artifact) { artifacts.push(artifact); } }), {
      query: "planning primitive",
      max_results: 2,
      freshness: "any",
      mode: "fixture",
    });

    expect(result.mode).toBe("fixture");
    expect(result.results[0]?.source_id).toBe("planning-primitive");
    expect(JSON.stringify(artifacts)).toContain("source_search_results");
  });

  it("does not silently fall back to fixtures for live search", async () => {
    const result = await runResearchSearchCommand({ query: "planning primitive" });

    expect((result.result as { readonly status?: string }).status).toBe("yielded");
    expect(JSON.stringify(result.result)).toContain("SEARCH_PROVIDER_NOT_CONFIGURED");
    expect(result.artifacts).toEqual([]);
  });

  it("labels fixture brief artifacts", async () => {
    const result = await runResearchBriefCommand({ topic: "planning primitive", mode: "fixture", output_dir: join(".open-lagrange", "test-research", "fixture-brief") });
    const searchArtifact = result.artifacts.find((artifact) => artifact.kind === "source_search_results");

    expect(searchArtifact?.source_mode).toBe("fixture");
    expect(searchArtifact?.execution_mode).toBe("fixture");
    expect(searchArtifact?.fixture_set).toBe("research-brief-demo");
    expect(searchArtifact?.live).toBe(false);
  });

  it("rejects unsafe live fetch URLs through the SDK HTTP primitive", async () => {
    await expect(runResearchFetchSource(createTestPackContext(), {
      url: "file:///etc/passwd",
      mode: "live",
      max_bytes: 500_000,
      timeout_ms: 8_000,
      accepted_content_types: ["text/plain"],
    })).rejects.toMatchObject({ primitive_code: "PRIMITIVE_POLICY_DENIED" });

    await expect(runResearchFetchSource(createTestPackContext(), {
      url: "http://localhost:4317",
      mode: "live",
      max_bytes: 500_000,
      timeout_ms: 8_000,
      accepted_content_types: ["text/plain"],
    })).rejects.toMatchObject({ primitive_code: "PRIMITIVE_POLICY_DENIED" });
  });

  it("enforces live fetch max bytes through the SDK HTTP primitive", async () => {
    await expect(runResearchFetchSource(createTestPackContext({
      runtime_config: {
        fetch_impl: async () => new Response("0123456789", { status: 200, headers: { "content-type": "text/plain" } }),
      },
    }), {
      url: "https://api.example.test/source",
      mode: "live",
      max_bytes: 4,
      timeout_ms: 8_000,
      accepted_content_types: ["text/plain"],
    })).rejects.toMatchObject({ primitive_code: "PRIMITIVE_RESPONSE_TOO_LARGE" });
  });

  it("uses the SDK HTTP primitive fetch implementation for live fetch", async () => {
    let calls = 0;
    const result = await runResearchFetchSource(createTestPackContext({
      runtime_config: {
        fetch_impl: async () => {
          calls += 1;
          return new Response("<html><title>Example</title><body><p>Hello from SDK HTTP.</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
        },
      },
    }), {
      url: "https://example.com",
      mode: "live",
      max_bytes: 500_000,
      timeout_ms: 8_000,
      accepted_content_types: ["text/html"],
    });

    expect(calls).toBe(1);
    expect(result.raw_artifact_id).toMatch(/^source_snapshot_/);
    expect(result.text_artifact_id).toMatch(/^source_text_/);
  });

  it("dry-run fetch validates without performing live fetch", async () => {
    const result = await runResearchFetchCommand({ url: "https://example.com", dry_run: true, output_dir: join(".open-lagrange", "test-research", "dry-run-fetch") });

    expect((result.result as { readonly status?: string }).status).toBe("yielded");
    expect(JSON.stringify(result.result)).toContain("dry run validated");
    expect(result.artifacts).toEqual([]);
  });

  it("summarize-url creates explicitly labeled fixture artifacts", async () => {
    const result = await runResearchSummarizeUrlCommand({
      url: "https://example.invalid/open-lagrange/planning-primitive",
      mode: "fixture",
      output_dir: join(".open-lagrange", "test-research", "summarize-url"),
    });

    expect(result.artifacts.some((artifact) => artifact.kind === "research_brief")).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.source_mode === "fixture")).toBe(true);
  });

  it("does not use raw network or process authority in research pack source", () => {
    const files = ["executor.ts", "fetcher.ts", "search-provider.ts"].map((file) => readFileSync(join(process.cwd(), "packages/core/src/capability-packs/research", file), "utf8"));
    const source = files.join("\n");

    expect(source).not.toMatch(/(?<!\.)\bfetch\(/);
    expect(source).not.toContain("child_process");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("curl");
    expect(source).not.toContain("wget");
  });

  it("extracts readable content without scripts or styles", () => {
    const text = stripHtml("<html><head><style>.x{}</style><script>secret()</script><title>T</title></head><body><h1>Hello</h1><p>World</p></body></html>");

    expect(text).toContain("Hello");
    expect(text).toContain("World");
    expect(text).not.toContain("secret()");
    expect(text).not.toContain(".x");
  });

  it("creates cited brief artifacts with lineage", async () => {
    const result = await runResearchBriefCommand({ topic: "planning primitive", mode: "fixture", output_dir: join(".open-lagrange", "test-research", "brief") });
    const brief = result.result as { readonly brief?: { readonly citations?: readonly unknown[] } };
    const lineageArtifact = result.artifacts.find((artifact) => artifact.kind === "research_brief");

    expect(brief.brief?.citations?.length).toBeGreaterThan(0);
    expect(lineageArtifact?.produced_by_pack_id).toBe("open-lagrange.research");
    expect(lineageArtifact?.produced_by_capability_id).toBe("research.create_brief");
  });

  it("routes chat and skills to research capabilities", () => {
    const route = routeIntent({ text: "make a cited brief about MCP security risks" });
    const frame = deterministicSkillFrame(parseSkillfileMarkdown([
      "# Research Brief",
      "",
      "## Goal",
      "Research a topic and produce a cited markdown briefing.",
      "",
      "## Outputs",
      "- cited research brief",
    ].join("\n")), now);
    const snapshot = buildCapabilitySnapshot(packRegistry.listCapabilities({}).map((capability) => ({
      endpoint_id: capability.pack_id,
      capability_name: capability.name,
      description: capability.description,
      input_schema: capability.input_schema,
      output_schema: capability.output_schema,
      risk_level: capability.risk_level,
      requires_approval: capability.requires_approval,
    })), now);
    const matches = matchCapabilitiesForSkill({ frame, capability_snapshot: snapshot });

    expect(route.flow?.flow_id).toBe("research_brief");
    expect(matches.matches.some((match) => match.pack_id === "open-lagrange.research")).toBe(true);
  });

  it("defines research workflow templates", () => {
    expect(researchWorkflowTemplates.find((template) => template.template_id === "research_brief_from_topic")?.runtime_step_kind).toBe("capability_step");
    expect(researchWorkflowCapabilityRefs("research_brief_from_topic")).toEqual([
      "research.plan_search",
      "research.search_sources",
      "research.select_sources",
      "research.fetch_source",
      "research.extract_content",
      "research.create_source_set",
      "research.create_brief",
      "research.export_markdown",
    ]);
  });
});
