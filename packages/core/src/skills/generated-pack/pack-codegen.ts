import YAML from "yaml";
import { capabilityDigest } from "@open-lagrange/capability-sdk";
import type { PackBuildPlan, ProposedCapability } from "./pack-build-plan.js";

export interface GeneratedPackFiles {
  readonly files: Readonly<Record<string, string>>;
}

export function generatePackFiles(plan: PackBuildPlan): GeneratedPackFiles {
  const capabilities = plan.proposed_capabilities;
  const first = capabilities[0] ?? defaultCapability(plan);
  const files: Record<string, string> = {
    "package.json": JSON.stringify(packageJson(plan), null, 2),
    "tsconfig.json": JSON.stringify(tsconfig(), null, 2),
    "vitest.config.ts": vitestConfig(),
    "README.md": readme(plan),
    "open-lagrange.pack.yaml": YAML.stringify(packYaml(plan)).trimEnd() + "\n",
    "src/index.ts": indexTs(plan),
    "src/manifest.ts": manifestTs(plan),
    "src/schemas.ts": schemasTs(),
    "tests/pack.test.ts": testTs(plan),
    "docs/security.md": securityDoc(plan),
    "docs/usage.md": usageDoc(plan),
  };
  for (const capability of capabilities.length > 0 ? capabilities : [first]) {
    files[`src/capabilities/${capability.name}.ts`] = capabilityTs(plan, capability);
  }
  return { files };
}

function packageJson(plan: PackBuildPlan): unknown {
  return {
    name: `@open-lagrange/generated-${plan.pack_id.replace(/[^a-z0-9_-]+/gi, "-")}`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      build: "tsc -p tsconfig.json",
      test: "vitest run",
    },
    dependencies: {
      "@open-lagrange/capability-sdk": "file:../../../packages/capability-sdk",
      zod: "^4.3.6",
    },
    devDependencies: {
      typescript: "^5.7.0",
      vitest: "^3.1.0",
    },
  };
}

function tsconfig(): unknown {
  return {
    compilerOptions: {
      target: "ES2022",
      outDir: "dist",
      rootDir: ".",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      declaration: true,
      sourceMap: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      types: ["node"],
    },
    include: ["src/**/*.ts", "tests/**/*.ts"],
  };
}

function packYaml(plan: PackBuildPlan): unknown {
  return {
    pack_id: plan.pack_id,
    name: plan.pack_name,
    version: "0.1.0",
    description: plan.description,
    publisher: "local",
    license: "MIT",
    trust_level: "review_required",
    runtime_kind: "local_trusted",
    capabilities: plan.proposed_capabilities.map((capability) => ({ ...capability, pack_id: plan.pack_id })),
    required_scopes: plan.required_scopes,
    provided_scopes: plan.required_scopes,
    required_secret_refs: plan.required_secret_refs.map((ref) => ({ ...ref, redacted: "********" })),
    oauth: { providers: plan.oauth_requirements },
    network: plan.network_requirements,
    filesystem: plan.filesystem_requirements,
    side_effects: plan.side_effects,
    approval_requirements: plan.approval_requirements,
    generation_mode: plan.generation_mode,
  };
}

function vitestConfig(): string {
  return [
    'import { defineConfig } from "vitest/config";',
    "",
    "export default defineConfig({",
    "  test: {",
    '    include: ["tests/**/*.test.ts"],',
    "  },",
    "});",
    "",
  ].join("\n");
}

function indexTs(plan: PackBuildPlan): string {
  const imports = plan.proposed_capabilities.map((capability) => `import { ${capability.name}Capability } from "./capabilities/${capability.name}.js";`).join("\n");
  const names = plan.proposed_capabilities.map((capability) => `${capability.name}Capability`).join(", ");
  return [
    'import type { CapabilityPack } from "@open-lagrange/capability-sdk";',
    'import { manifest } from "./manifest.js";',
    imports,
    "",
    `export const generatedCapabilityPack: CapabilityPack = {`,
    "  manifest,",
    `  capabilities: [${names}],`,
    "};",
    "",
    "export default generatedCapabilityPack;",
    "",
  ].join("\n");
}

function manifestTs(plan: PackBuildPlan): string {
  return [
    'import type { PackManifest } from "@open-lagrange/capability-sdk";',
    "",
    "export const manifest: PackManifest = {",
    `  pack_id: ${JSON.stringify(plan.pack_id)},`,
    `  name: ${JSON.stringify(plan.pack_name)},`,
    '  version: "0.1.0",',
    `  description: ${JSON.stringify(plan.description)},`,
    '  publisher: "local",',
    '  license: "MIT",',
    '  runtime_kind: "local_trusted",',
    '  trust_level: "review_required",',
    `  required_scopes: ${JSON.stringify(plan.required_scopes)},`,
    `  provided_scopes: ${JSON.stringify(plan.required_scopes)},`,
    `  default_policy: ${JSON.stringify({
      required_secrets: plan.required_secret_refs.map((ref) => ref.ref_id),
      oauth_providers: plan.oauth_requirements.map((item) => item.provider_id),
      allowed_hosts: plan.network_requirements.allowed_hosts,
      filesystem: plan.filesystem_requirements,
      side_effects: plan.side_effects,
      approval_requirements: plan.approval_requirements,
    }, null, 2)},`,
    "  open_cot_alignment: { portable: true },",
    "};",
    "",
  ].join("\n");
}

function schemasTs(): string {
  return [
    'import { z } from "zod";',
    "",
    "export const GeneratedPackInput = z.object({",
    "  query: z.string().min(1),",
    "  dry_run: z.boolean().optional(),",
    "}).strict();",
    "",
    "export const GeneratedPackOutput = z.object({",
    "  summary: z.string(),",
    "  dry_run: z.boolean(),",
    "}).strict();",
    "",
    "export type GeneratedPackInput = z.infer<typeof GeneratedPackInput>;",
    "export type GeneratedPackOutput = z.infer<typeof GeneratedPackOutput>;",
    "",
  ].join("\n");
}

function capabilityTs(plan: PackBuildPlan, capability: ProposedCapability): string {
  const descriptor = { ...capability, pack_id: plan.pack_id };
  const digest = capabilityDigest(descriptor);
  return [
    'import type { CapabilityDefinition } from "@open-lagrange/capability-sdk";',
    'import { artifacts, createPrimitiveContext } from "@open-lagrange/capability-sdk/primitives";',
    'import { GeneratedPackInput, GeneratedPackOutput } from "../schemas.js";',
    "",
    `export const ${capability.name}Capability: CapabilityDefinition = {`,
    "  descriptor: {",
    `    capability_id: ${JSON.stringify(capability.capability_id)},`,
    `    pack_id: ${JSON.stringify(plan.pack_id)},`,
    `    name: ${JSON.stringify(capability.name)},`,
    `    description: ${JSON.stringify(capability.description)},`,
    `    input_schema: ${JSON.stringify(capability.input_schema)},`,
    `    output_schema: ${JSON.stringify(capability.output_schema)},`,
    `    risk_level: ${JSON.stringify(capability.risk_level)},`,
    `    side_effect_kind: ${JSON.stringify(capability.side_effect_kind)},`,
    `    requires_approval: ${JSON.stringify(capability.requires_approval)},`,
    `    idempotency_mode: ${JSON.stringify(capability.idempotency_mode)},`,
    `    timeout_ms: ${JSON.stringify(capability.timeout_ms)},`,
    `    max_attempts: ${JSON.stringify(capability.max_attempts)},`,
    `    scopes: ${JSON.stringify(capability.scopes)},`,
    `    tags: ${JSON.stringify(capability.tags)},`,
    `    examples: ${JSON.stringify(capability.examples)},`,
    `    capability_digest: ${JSON.stringify(digest)},`,
    "  },",
    "  input_schema: GeneratedPackInput,",
    "  output_schema: GeneratedPackOutput,",
    "  async execute(context, input) {",
    "    const primitives = createPrimitiveContext(context, {",
    `      pack_id: ${JSON.stringify(plan.pack_id)},`,
    `      capability_id: ${JSON.stringify(capability.capability_id)},`,
    "    });",
    "    const parsed = GeneratedPackInput.parse(input);",
    "    const output = GeneratedPackOutput.parse({",
    `      summary: ${JSON.stringify(`${plan.pack_name} dry-run response`)} + ": " + parsed.query,`,
    "      dry_run: parsed.dry_run ?? true,",
    "    });",
    "    await artifacts.write(primitives, {",
    `      artifact_id: ${JSON.stringify(`${capability.capability_id}.dry_run`)},`,
    '      kind: "generated_pack_dry_run",',
    "      summary: output.summary,",
    "      content: output,",
    '      validation_status: "pass",',
    '      redaction_status: "redacted",',
    "    });",
    "    return output;",
    "  },",
    "};",
    "",
  ].join("\n");
}

function testTs(plan: PackBuildPlan): string {
  const first = plan.proposed_capabilities[0] ?? defaultCapability(plan);
  return [
    'import { describe, expect, it } from "vitest";',
    'import { createTestPackContext } from "@open-lagrange/capability-sdk";',
    'import { generatedCapabilityPack } from "../src/index.js";',
    "",
    `describe(${JSON.stringify(plan.pack_id)}, () => {`,
    '  it("declares a valid manifest and capabilities", () => {',
    `    expect(generatedCapabilityPack.manifest.pack_id).toBe(${JSON.stringify(plan.pack_id)});`,
    "    expect(generatedCapabilityPack.capabilities.length).toBeGreaterThan(0);",
    "  });",
    "",
    '  it("runs the generated capability in dry-run mode", async () => {',
    "    const capability = generatedCapabilityPack.capabilities[0];",
    "    if (!capability) throw new Error('missing capability');",
    "    const output = await capability.execute(createTestPackContext(), { query: 'status', dry_run: true });",
    "    expect(output).toMatchObject({ dry_run: true });",
    "  });",
    "",
    '  it("keeps secret values out of generated source metadata", () => {',
    `    expect(JSON.stringify(generatedCapabilityPack.manifest)).not.toContain("sk-");`,
    `    expect(${JSON.stringify(first.requires_approval)}).toBe(${JSON.stringify(first.risk_level !== "read")});`,
    "  });",
    "});",
    "",
  ].join("\n");
}

function readme(plan: PackBuildPlan): string {
  return [
    `# ${plan.pack_name}`,
    "",
    plan.description,
    "",
    "This generated Capability Pack is a reviewable source artifact. It is not trusted until validation passes and a user explicitly installs it.",
    "",
    "## Capabilities",
    ...plan.proposed_capabilities.map((capability) => `- \`${capability.name}\`: ${capability.description}`),
    "",
  ].join("\n");
}

function securityDoc(plan: PackBuildPlan): string {
  return [
    `# Security Review: ${plan.pack_name}`,
    "",
    "- Generated source uses Capability Pack SDK types.",
    "- Raw secrets are not embedded in generated source.",
    "- Validation must pass before install.",
    `- Required scopes: ${plan.required_scopes.join(", ") || "none"}`,
    `- Allowed hosts: ${plan.network_requirements.allowed_hosts.join(", ") || "none"}`,
    "",
  ].join("\n");
}

function usageDoc(plan: PackBuildPlan): string {
  return [
    `# Usage: ${plan.pack_name}`,
    "",
    "Validate before install:",
    "",
    "```sh",
    "open-lagrange pack validate .",
    "```",
    "",
  ].join("\n");
}

function defaultCapability(plan: PackBuildPlan): ProposedCapability {
  return plan.proposed_capabilities[0] ?? {
    capability_id: `${plan.pack_id}.run`,
    name: "run",
    description: `Dry-run capability for ${plan.pack_name}.`,
    input_schema: { type: "object", required: ["query"], properties: { query: { type: "string" }, dry_run: { type: "boolean" } }, additionalProperties: false },
    output_schema: { type: "object", required: ["summary", "dry_run"], properties: { summary: { type: "string" }, dry_run: { type: "boolean" } }, additionalProperties: false },
    risk_level: "read",
    side_effect_kind: "none",
    requires_approval: false,
    idempotency_mode: "recommended",
    timeout_ms: 5000,
    max_attempts: 1,
    scopes: plan.required_scopes,
    tags: ["generated", "primitive:artifact"],
    examples: [{ input: { query: "status", dry_run: true }, output: { summary: "status", dry_run: true } }],
  };
}
