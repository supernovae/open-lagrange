import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectPack } from "../src/packs/pack-inspector.js";
import { getPackHealth } from "../src/packs/pack-health.js";
import { runPackSmoke } from "../src/packs/pack-smoke.js";
import { loadInstalledPacksForRuntime } from "../src/packs/runtime-pack-loader.js";
import { parseSkillfileMarkdown } from "../src/skills/skillfile-parser.js";
import { deterministicSkillFrame } from "../src/skills/skill-frame.js";
import { decideSkillBuild } from "../src/skills/skill-build-decision.js";
import { matchCapabilitiesForSkill } from "../src/skills/capability-match.js";
import { createPackBuildPlan, scaffoldGeneratedPack } from "../src/skills/generated-pack/pack-generator.js";
import { installGeneratedPack } from "../src/skills/generated-pack/pack-install.js";
import { writePackScaffold } from "../src/skills/generated-pack/pack-scaffold.js";
import { validateGeneratedPack } from "../src/skills/generated-pack/pack-validator.js";
import { validateStaticSafety } from "../src/skills/generated-pack/static-safety-validator.js";
import { buildCapabilitySnapshot } from "../src/schemas/capabilities.js";

const now = "2026-04-29T12:00:00.000Z";
const generatedRoots: string[] = [];

afterEach(() => {
  for (const root of generatedRoots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});

describe("generated capability packs", () => {
  it("creates a typed build plan and generated pack scaffold", () => {
    const root = generatedRoot();
    const frame = deterministicSkillFrame(parseSkillfileMarkdown(githubSkill()), now);
    const matches = matchCapabilitiesForSkill({ frame, capability_snapshot: buildCapabilitySnapshot([], now) });
    const decision = decideSkillBuild({ frame, capability_matches: matches });
    const plan = createPackBuildPlan({ frame, decision, experimental_codegen: false, now });
    const scaffold = writePackScaffold({ plan, output_dir: root });

    expect(plan.pack_id).toMatch(/^local\./);
    expect(scaffold.files).toContain("open-lagrange.pack.yaml");
    expect(scaffold.files).toContain("src/index.ts");
    expect(scaffold.files).toContain("tests/pack.test.ts");
  });

  it("validates generated pack source and exposes inspection metadata", () => {
    const scaffold = scaffoldGeneratedPack({ pack_id: "local.http-json-fetcher", output_dir: generatedRoot(), now });
    const report = validateGeneratedPack({ pack_path: scaffold.pack_path, now });
    const inspection = inspectPack(scaffold.pack_path);

    expect(report.status).toBe("pass");
    expect(inspection?.pack_id).toBe("local.http-json-fetcher");
    expect(inspection?.capabilities[0]?.input_schema).toBeTruthy();
  });

  it("blocks obvious unsafe TypeScript patterns", () => {
    const root = mkdtempSync(join(tmpdir(), "ol-generated-pack-safety-"));
    generatedRoots.push(root);
    writeFileSync(join(root, "unsafe.ts"), "import { exec } from 'node:child_process';\nconsole.log(process.env.API_KEY);\n", "utf8");

    const report = validateStaticSafety({ pack_path: root, files: ["unsafe.ts"] });

    expect(report.passed).toBe(false);
    expect(report.findings.map((finding) => finding.message).join("\n")).toContain("child_process");
    expect(report.findings.map((finding) => finding.message).join("\n")).toContain("process.env");
  });

  it("installs only after validation into the local trusted registry", () => {
    const scaffold = scaffoldGeneratedPack({ pack_id: "local.markdown-transformer", output_dir: generatedRoot(), now });
    const home = mkdtempSync(join(tmpdir(), "ol-generated-pack-home-"));
    generatedRoots.push(home);
    const report = installGeneratedPack({ pack_path: scaffold.pack_path, home_dir: home, now });

    expect(report.status).toBe("installed");
    expect(report.load_status).toBe("pending_restart");
    expect(existsSync(join(home, "packs", "registry.json"))).toBe(true);
  });

  it("loads installed template-first packs through the runtime registry path", () => {
    const scaffold = scaffoldGeneratedPack({ pack_id: "local.runtime-markdown-transformer", output_dir: generatedRoot(), now });
    const home = mkdtempSync(join(tmpdir(), "ol-generated-pack-runtime-"));
    generatedRoots.push(home);
    installGeneratedPack({ pack_path: scaffold.pack_path, home_dir: home, now });

    const report = loadInstalledPacksForRuntime({ getPack: () => undefined, registerPack: (pack: { readonly manifest: { readonly pack_id: string } }) => ({ getPack: () => pack }) } as never, { packs_dir: join(home, "packs"), now });

    expect(report.items[0]?.status).toBe("loaded");
    expect(report.items[0]?.capabilities_registered[0]).toContain("local.runtime-markdown-transformer");
  });

  it("does not load experimental generated packs without explicit runtime trust", () => {
    const frame = deterministicSkillFrame(parseSkillfileMarkdown(githubSkill()), now);
    const matches = matchCapabilitiesForSkill({ frame, capability_snapshot: buildCapabilitySnapshot([], now) });
    const decision = decideSkillBuild({ frame, capability_matches: matches });
    const plan = createPackBuildPlan({ frame, decision, experimental_codegen: true, now });
    const scaffold = writePackScaffold({ plan, output_dir: generatedRoot() });
    const home = mkdtempSync(join(tmpdir(), "ol-generated-pack-experimental-"));
    generatedRoots.push(home);
    installGeneratedPack({ pack_path: scaffold.pack_path, home_dir: home, now });

    const report = loadInstalledPacksForRuntime({ getPack: () => undefined, registerPack: () => { throw new Error("should not register"); } } as never, { packs_dir: join(home, "packs"), now });

    expect(report.items[0]?.status).toBe("skipped");
    expect(report.items[0]?.reason).toContain("Experimental codegen");
  });

  it("does not load invalid installed registry entries", () => {
    const home = mkdtempSync(join(tmpdir(), "ol-generated-pack-invalid-"));
    generatedRoots.push(home);
    mkdirSync(join(home, "packs"), { recursive: true });
    writeFileSync(join(home, "packs", "registry.json"), JSON.stringify({
      schema_version: "open-lagrange.local-pack-registry.v1",
      updated_at: now,
      packs: [{
        pack_id: "local.invalid-pack",
        name: "Invalid Pack",
        version: "0.1.0",
        source_path: join(home, "packs", "trusted-local", "local.invalid-pack"),
        manifest_path: join(home, "packs", "trusted-local", "local.invalid-pack", "open-lagrange.pack.yaml"),
        trust_level: "trusted_local",
        validation_status: "pass",
        installed_at: now,
        installed_by: "test",
        capabilities: [],
        required_scopes: [],
        required_secret_refs: [],
        oauth_requirements: [],
        network_requirements: {},
        filesystem_requirements: {},
        side_effects: [],
        approval_requirements: [],
        generation_mode: "template_first",
        load_status: "pending_restart",
      }],
    }, null, 2), "utf8");

    const report = loadInstalledPacksForRuntime({ getPack: () => undefined, registerPack: () => { throw new Error("should not register"); } } as never, { packs_dir: join(home, "packs"), now });

    expect(report.items[0]?.status).toBe("failed");
  });

  it("reports pack health and creates smoke artifacts", async () => {
    const scaffold = scaffoldGeneratedPack({ pack_id: "local.health-markdown-transformer", output_dir: generatedRoot(), now });
    const home = mkdtempSync(join(tmpdir(), "ol-generated-pack-health-"));
    const indexPath = join(home, "artifacts", "index.json");
    generatedRoots.push(home);
    installGeneratedPack({ pack_path: scaffold.pack_path, home_dir: home, now });

    const health = getPackHealth({ pack_id: "local.health-markdown-transformer", packs_dir: join(home, "packs"), now });
    const smoke = await runPackSmoke({ pack_id: "local.health-markdown-transformer", packs_dir: join(home, "packs"), index_path: indexPath, now });

    expect(health[0]?.validation_status).toBe("pass");
    expect(smoke.status).toBe("pass");
    expect(existsSync(indexPath)).toBe(true);
  });
});

function generatedRoot(): string {
  const root = join(process.cwd(), ".open-lagrange", `test-generated-packs-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  generatedRoots.push(root);
  return root;
}

function githubSkill(): string {
  return [
    "# GitHub PR Helper",
    "",
    "## Goal",
    "Read GitHub pull request metadata and write a review artifact.",
    "",
    "## Inputs",
    "- repository owner",
    "- pull request number",
    "",
    "## Outputs",
    "- pull request summary",
    "",
    "## Tools",
    "- GitHub pull request API",
    "",
    "## Permissions",
    "- github:pull_request:read",
    "",
    "## Secrets",
    "- github.default",
  ].join("\n");
}
