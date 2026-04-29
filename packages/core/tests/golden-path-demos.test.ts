import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import type { CapabilityPack } from "@open-lagrange/capability-sdk";
import { createArtifactSummary, registerArtifacts, showArtifact } from "../src/artifacts/artifact-viewer.js";
import { listRunArtifacts, recentArtifacts, showRun } from "../src/artifacts/run-index.js";
import { listDemos, runDemo } from "../src/demos/demo-runner.js";
import { runCoreDoctor } from "../src/doctor/doctor.js";
import { inspectPack } from "../src/packs/pack-inspector.js";
import { validateCapabilityPack } from "../src/packs/pack-validator.js";

const now = "2026-04-28T12:00:00.000Z";
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;

afterEach(() => {
  setEnv("OPENAI_API_KEY", originalOpenAiKey);
  setEnv("AI_GATEWAY_API_KEY", originalGatewayKey);
});

describe("golden path demos and runtime hardening", () => {
  it("lists the demo registry entries", () => {
    expect(listDemos().map((demo) => demo.demo_id)).toEqual(["repo-json-output", "skills-research-brief", "skills-notes-draft"]);
  });

  it("creates expected repository demo artifacts", async () => {
    const root = tempDir();
    const result = await runDemo({ demo_id: "repo-json-output", output_dir: join(root, "repo"), index_path: join(root, "index.json"), now });

    expect(result.artifacts.map((artifact) => artifact.kind)).toContain("planfile");
    expect(result.artifacts.map((artifact) => artifact.kind)).toContain("patch_artifact");
    expect(result.artifacts.find((artifact) => artifact.kind === "verification_report")?.related_plan_id).toMatch(/^plan_/);
    expect(showRun("latest", join(root, "runs-index.json"))?.primary_artifact_refs.length).toBeGreaterThan(0);
    expect(listRunArtifacts({ run_id: "latest", role: "primary_output", artifact_index_path: join(root, "index.json"), run_index_path: join(root, "runs-index.json") }).map((artifact) => artifact.kind)).toContain("patch_artifact");
    expect(recentArtifacts({ artifact_index_path: join(root, "index.json"), run_index_path: join(root, "runs-index.json") }).length).toBeGreaterThan(0);
  });

  it("executes the repository demo through a live local worktree", async () => {
    const root = tempDir();
    const result = await runDemo({ demo_id: "repo-json-output", dry_run: false, output_dir: join(root, "repo-live"), index_path: join(root, "index.json"), now });

    const finalPatch = showArtifact(result.artifacts.find((artifact) => artifact.title === "Final Patch")?.artifact_id ?? "", join(root, "index.json"));
    const verification = showArtifact(result.artifacts.find((artifact) => artifact.kind === "verification_report")?.artifact_id ?? "", join(root, "index.json"));

    expect(JSON.stringify(finalPatch?.content)).toContain("JSON.stringify");
    expect(JSON.stringify(verification?.content)).toContain("node src/cli.js status --json");
  });

  it("creates research skill artifacts without live source access", async () => {
    const root = tempDir();
    const result = await runDemo({ demo_id: "skills-research-brief", output_dir: join(root, "research"), index_path: join(root, "index.json"), now });

    expect(result.artifacts.map((artifact) => artifact.kind)).toContain("workflow_skill");
    expect(result.artifacts.map((artifact) => artifact.kind)).toContain("research_brief");
    expect(result.artifacts.find((artifact) => artifact.kind === "workflow_skill")?.related_plan_id).toMatch(/^plan_/);
    const brief = showArtifact(result.artifacts.find((artifact) => artifact.kind === "research_brief")?.artifact_id ?? "", join(root, "index.json"));
    expect(JSON.stringify(brief?.content)).toContain("mocked");
  });

  it("redacts sensitive fields when viewing artifacts", () => {
    const root = tempDir();
    const path = join(root, "secret-artifact.json");
    const indexPath = join(root, "index.json");
    writeFileSync(path, JSON.stringify({ token: "sk-test-1234567890", nested: { value: "secret-value" } }), "utf8");
    const summary = createArtifactSummary({
      artifact_id: "secret_artifact",
      kind: "raw_log",
      title: "Sensitive artifact",
      summary: "Contains sensitive shaped fields.",
      path_or_uri: path,
      content_type: "application/json",
      created_at: now,
    });

    registerArtifacts({ artifacts: [summary], index_path: indexPath, now });

    expect(showArtifact("secret_artifact", indexPath)?.content).toEqual({ token: "********", nested: { value: "********" } });
  });

  it("doctor reports a missing model credential when no local source is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    const report = await runCoreDoctor({ profile_name: "missing-test-profile", api_url: "http://127.0.0.1:9" });

    expect(report.checks.find((check) => check.id === "model_credential")?.status).toBe("warn");
  });

  it("inspects registered packs with risk and side effect metadata", () => {
    const pack = inspectPack("open-lagrange.repository");

    expect(pack?.capabilities.length).toBeGreaterThan(0);
    expect(pack?.capabilities[0]).toHaveProperty("risk_level");
    expect(pack?.capabilities[0]).toHaveProperty("side_effect_kind");
  });

  it("rejects packs with missing schemas", () => {
    const result = validateCapabilityPack(invalidPack());

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("missing input schema");
    expect(result.errors.join("\n")).toContain("must require approval");
  });
});

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "ol-demo-test-"));
}

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function invalidPack(): CapabilityPack {
  return {
    manifest: {
      pack_id: "test.invalid",
      name: "Invalid test pack",
      version: "0.0.0",
      description: "Invalid pack used by tests.",
      publisher: "test",
      license: "MIT",
      runtime_kind: "mock",
      trust_level: "experimental",
      required_scopes: [],
      provided_scopes: [],
      default_policy: {},
      open_cot_alignment: {},
    },
    capabilities: [{
      descriptor: {
        capability_id: "test.invalid.write",
        pack_id: "test.invalid",
        name: "test.write",
        description: "Invalid write capability.",
        input_schema: {},
        output_schema: {},
        risk_level: "write",
        side_effect_kind: "filesystem_write",
        requires_approval: false,
        idempotency_mode: "not_applicable",
        timeout_ms: 1000,
        max_attempts: 1,
        scopes: [],
        tags: [],
        examples: [],
      },
      input_schema: z.object({}),
      output_schema: z.object({}),
      execute: () => ({}),
    }],
  };
}
