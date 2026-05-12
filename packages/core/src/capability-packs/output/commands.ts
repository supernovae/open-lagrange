import { join, resolve } from "node:path";
import { createTestPackContext } from "@open-lagrange/capability-sdk";
import { type ArtifactSummary } from "../../artifacts/index.js";
import { listModelRouteConfigs } from "../../evals/model-route-config.js";
import { createLocalPlanArtifactStore } from "../../planning/local-plan-artifacts.js";
import { stableHash } from "../../util/hash.js";
import {
  runOutputCreateDigest,
  runOutputCreateManifest,
  runOutputCreateRunPacket,
  runOutputExportArtifacts,
  runOutputRenderHtml,
  runOutputRenderMarkdown,
  runOutputRenderPdf,
  runOutputSelectArtifacts,
} from "./executor.js";
import type {
  CreateDigestInput,
  CreateManifestInput,
  CreateRunPacketInput,
  ExportArtifactsInput,
  RenderHtmlInput,
  RenderMarkdownInput,
  RenderPdfInput,
  SelectArtifactsInput,
} from "./schemas.js";

export interface OutputCommandResult {
  readonly run_id: string;
  readonly output_dir: string;
  readonly result: unknown;
  readonly artifacts: readonly ArtifactSummary[];
}

export async function runOutputSelectCommand(input: SelectArtifactsInput & CommandOptions): Promise<OutputCommandResult> {
  return runOutputCommand("select", input, (context) => runOutputSelectArtifacts(context, input));
}

export async function runOutputDigestCommand(input: CreateDigestInput & CommandOptions): Promise<OutputCommandResult> {
  return runOutputCommand("digest", input, (context) => runOutputCreateDigest(context, input));
}

export async function runOutputPacketCommand(input: CreateRunPacketInput & CommandOptions): Promise<OutputCommandResult> {
  return runOutputCommand("packet", input, (context) => runOutputCreateRunPacket(context, input));
}

export async function runOutputRenderMarkdownCommand(input: RenderMarkdownInput & CommandOptions): Promise<OutputCommandResult> {
  return runOutputCommand("render-markdown", input, (context) => runOutputRenderMarkdown(context, input));
}

export async function runOutputRenderHtmlCommand(input: RenderHtmlInput & CommandOptions): Promise<OutputCommandResult> {
  return runOutputCommand("render-html", input, (context) => runOutputRenderHtml(context, input));
}

export async function runOutputRenderPdfCommand(input: RenderPdfInput & CommandOptions): Promise<OutputCommandResult> {
  return runOutputCommand("render-pdf", input, (context) => runOutputRenderPdf(context, input));
}

export async function runOutputExportCommand(input: ExportArtifactsInput & CommandOptions): Promise<OutputCommandResult> {
  return runOutputCommand("export", input, (context) => runOutputExportArtifacts(context, input));
}

export async function runOutputManifestCommand(input: CreateManifestInput & CommandOptions): Promise<OutputCommandResult> {
  return runOutputCommand("manifest", input, (context) => runOutputCreateManifest(context, input));
}

interface CommandOptions {
  readonly output_dir?: string;
  readonly index_path?: string;
  readonly model_route_id?: string;
}

async function runOutputCommand(
  label: string,
  input: CommandOptions,
  execute: (context: ReturnType<typeof createTestPackContext>) => Promise<unknown>,
): Promise<OutputCommandResult> {
  const run = commandRun(label, input.output_dir);
  const store = createLocalPlanArtifactStore({ plan_id: run.run_id, output_dir: run.output_dir });
  const context = createTestPackContext({
    recordArtifact: store.recordArtifact,
    runtime_config: {
      artifact_store: store,
      artifact_dir: run.output_dir,
      ...(input.index_path ? { artifact_index_path: input.index_path } : {}),
      model_route: input.model_route_id ? listModelRouteConfigs().find((route) => route.route_id === input.model_route_id) : listModelRouteConfigs()[0],
    },
  });
  const result = await execute(context);
  const artifacts = store.flush(input.index_path);
  return { run_id: run.run_id, output_dir: run.output_dir, result, artifacts };
}

function commandRun(label: string, outputDir?: string): { readonly run_id: string; readonly output_dir: string } {
  const run_id = `output_${stableHash({ label, now: new Date().toISOString() }).slice(0, 16)}`;
  return { run_id, output_dir: resolve(outputDir ?? join(".open-lagrange", "output", run_id)) };
}
