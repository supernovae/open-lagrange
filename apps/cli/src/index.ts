#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { approvalTokenForRequest } from "@open-lagrange/core/approval";
import { exportArtifact, listArtifacts, listArtifactsForPlan, listRunArtifacts, listRuns, pruneArtifacts, recentArtifacts, reindexArtifacts, showArtifact, showRun } from "@open-lagrange/core/artifacts";
import { listDemos, openDemo, runDemo } from "@open-lagrange/core/demos";
import { runCoreDoctor } from "@open-lagrange/core/doctor";
import { getPackHealth, inspectPack, listInspectablePacks, runPackSmoke, validateRegisteredPack } from "@open-lagrange/core/packs";
import { acceptDefaultAnswers, addPlanLibrary, answerQuestion, checkAndCreateRunFromBuilderSession, checkAndCreateRunFromPlanfile, checkAndCreateScheduleRecord, composeInitialPlan, composePlanfileFromIntent, derivePlanRequirements, diffPlanfileMarkdown, generateGoalFrame, generatePlanfile, getPlanBuilderSession, getScheduleRecord, importBuilderPlanfileFromMarkdown, instantiatePlanTemplate, listPlanBuilderSessions, listPlanLibraries, listPlanLibraryPlans, listScheduleRecords, parsePlanfileMarkdown, parsePlanfileYaml, planCheckBlocksRun, reconcilePlanfileMarkdown, removePlanLibrary, removeSavedPlanFromLibrary, renderPlanfileMarkdown, renderPlanMermaid, resolvePlanLibraryEntry, revisePlan, runPlanCheck, saveBuilderSessionToLibrary, savePlanBuilderSession, savePlanToLibrary, saveReadyPlanfile, showPlanFromLibrary, showPlanLibrary, simulatePlan, stabilizePlan, syncPlanLibrary, updateBuilderPlanfileFromMarkdown, validatePlan, validatePlanfile, withCanonicalPlanDigest } from "@open-lagrange/core/planning";
import { applyRepositoryPlanfile as applyLocalRepositoryPlanfile, approveApprovalRequest, approveRepositoryScopeRequest, buildRepositoryDiffView, buildRepositoryRunView, cleanupRepositoryPlan as cleanupLocalRepositoryPlan, createRepositoryPlanfile, exportRepositoryPlanPatch as exportLocalRepositoryPlanPatch, formatRepositoryDiff, formatRepositoryEvidence, formatRepositoryExplanation, formatRepositoryStatus, formatRepositoryVerification, formatRepositoryWorktree, getRepositoryPlanStatus as getLocalRepositoryPlanStatus, listRepositoryModelCalls, rejectApprovalRequest, rejectRepositoryScopeRequest, resumeRepositoryPlan, runRepositoryDoctor } from "@open-lagrange/core/repository";
import { compareBenchmarkRun, listBenchmarkScenarios, listModelRouteConfigs, renderBenchmarkReport, runModelRoutingBenchmark } from "@open-lagrange/core/evals";
import { buildResearchRunViewForRun, checkAndCreateResearchRun, composeResearchPlan, explainResearchRunById, exportResearchViewArtifact, runResearchFetchCommand, runResearchSearchCommand, scheduleResearchPlan, writeResearchPlanfile } from "@open-lagrange/core/research";
import { runOutputDigestCommand, runOutputExportCommand, runOutputManifestCommand, runOutputPacketCommand, runOutputRenderHtmlCommand, runOutputRenderMarkdownCommand, runOutputRenderPdfCommand, runOutputSelectCommand } from "@open-lagrange/core/output";
import type { SearchProviderConfig } from "@open-lagrange/core/search";
import { buildGeneratedPackFromMarkdown, generateSkillFrame, generateWorkflowSkill, installGeneratedPack, parseSkillfileMarkdown, parseWorkflowSkillMarkdown, previewWorkflowSkillRun, scaffoldGeneratedPack, validateGeneratedPack, validateWorkflowSkill } from "@open-lagrange/core/skills";
import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import { addLocalProfile, addRemoteProfile, bootstrapLocalRuntime, configureCurrentProfileModelProvider, deleteCurrentProfileSecret, describeCurrentProfileModelProvider, describeCurrentProfileSecret, getCurrentProfile, getProfilePackPaths, initRuntime, listCurrentProfileModelProviders, listCurrentProfileSecrets, listKnownModelProviders, loadConfig, removeProfile, restartLocalRuntime, setCurrentProfile, setCurrentProfileSecret, startLocalRuntime, stopLocalRuntime, tailLogs, getRuntimeStatus } from "@open-lagrange/runtime-manager";
import type { SecretRef } from "@open-lagrange/core/secrets";
import { apiReplayMode, buildRunSnapshot } from "@open-lagrange/core/runs";
import { getStateStore } from "@open-lagrange/core/storage";
import { parseEditorCommand } from "./editor-command.js";
import { groupedHelpText } from "./help-taxonomy.js";

const program = new Command();

program
  .name("open-lagrange")
  .description("Open Lagrange Control Plane CLI.");

program.addHelpText("after", groupedHelpText());

program
  .command("init")
  .description("Create a local Open Lagrange runtime profile.")
  .option("--runtime <runtime>", "docker or podman")
  .option("--with-search", "Configure and enable a local SearXNG search container", false)
  .action(async (options: { readonly runtime?: string; readonly withSearch: boolean }) => {
    const runtime = runtimeOption(options.runtime);
    console.log(JSON.stringify(await initRuntime({ ...(runtime ? { runtime } : {}), withSearch: options.withSearch }), null, 2));
  });

program
  .command("bootstrap")
  .description("Initialize and start the local runtime in one step.")
  .option("--runtime <runtime>", "docker or podman")
  .option("--dev", "Run API and worker as local Node processes", false)
  .option("--force-init", "Regenerate the managed local profile and compose file", false)
  .option("--with-search", "Configure and enable a local SearXNG search container", false)
  .action(async (options: { readonly runtime?: string; readonly dev: boolean; readonly forceInit: boolean; readonly withSearch: boolean }) => {
    const runtime = runtimeOption(options.runtime);
    console.log(JSON.stringify(await bootstrapLocalRuntime({ ...(runtime ? { runtime } : {}), dev: options.dev, forceInit: options.forceInit, withSearch: options.withSearch }), null, 2));
  });

program
  .command("up")
  .description("Start the local runtime for the current profile.")
  .option("--runtime <runtime>", "docker or podman")
  .option("--dev", "Run API and worker as local Node processes", false)
  .option("--with-search", "Configure and enable a local SearXNG search container", false)
  .action(async (options: { readonly runtime?: string; readonly dev: boolean; readonly withSearch: boolean }) => {
    const runtime = runtimeOption(options.runtime);
    console.log(JSON.stringify(await startLocalRuntime({ ...(runtime ? { runtime } : {}), dev: options.dev, withSearch: options.withSearch }), null, 2));
  });

program.command("down").description("Stop the local runtime.").action(async () => {
  console.log(JSON.stringify(await stopLocalRuntime(), null, 2));
});

program.command("restart").description("Restart the local runtime.")
  .option("--runtime <runtime>", "docker or podman")
  .option("--dev", "Run API and worker as local Node processes", false)
  .option("--with-search", "Configure and enable a local SearXNG search container", false)
  .action(async (options: { readonly runtime?: string; readonly dev: boolean; readonly withSearch: boolean }) => {
    const runtime = runtimeOption(options.runtime);
    console.log(JSON.stringify(await restartLocalRuntime({ ...(runtime ? { runtime } : {}), dev: options.dev, withSearch: options.withSearch }), null, 2));
  });

program
  .command("status")
  .description("Show runtime status, or project status when an ID is provided.")
  .argument("[projectOrRunId]", "Project ID or run ID")
  .action(async (projectOrRunId: string | undefined) => {
    if (projectOrRunId) {
      const snapshot = await buildRunSnapshot({ run_id: projectOrRunId }).catch(() => undefined);
      if (snapshot) {
        console.log(JSON.stringify(snapshot, null, 2));
        return;
      }
      console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getProjectStatus(projectOrRunId), null, 2));
    } else console.log(JSON.stringify(await getRuntimeStatus(), null, 2));
  });

program.command("doctor").description("Run local or remote profile checks.").action(async () => {
  console.log(JSON.stringify(await runCoreDoctor(), null, 2));
});

program.command("logs").description("Show local runtime logs.").argument("[service]", "api, worker, web, hatchet, all, or a compose service").action(async (service: string | undefined) => {
  console.log(await tailLogs(service));
});

program.command("tui").description("Start the terminal Plan/Run workbench.").allowUnknownOption(true).allowExcessArguments(true).action(async () => {
  const args = process.argv.slice(process.argv.indexOf("tui") + 1);
  const child = spawn("npm", ["run", "dev:tui", "--", ...args], { cwd: findScriptRoot("dev:tui"), stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
});

program
  .command("submit")
  .description("Submit a project reconciliation run through the Control Plane API.")
  .argument("<goal>", "User goal")
  .action(async (goal: string) => {
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).submitProject({ goal }), null, 2));
  });

program
  .command("approve")
  .description("Approve a task.")
  .argument("<taskId>", "Task ID or task run ID")
  .requiredOption("--reason <reason>", "Approval reason")
  .requiredOption("--approval-token <approvalToken>", "Approval token")
  .option("--approved-by <approvedBy>", "Approver identifier", "human-local")
  .action(async (taskId: string, options: { readonly reason: string; readonly approvalToken: string; readonly approvedBy: string }) => {
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).approveTask(taskId, { decided_by: options.approvedBy, reason: options.reason, approval_token: options.approvalToken }), null, 2));
  });

program
  .command("reject")
  .description("Reject a task.")
  .argument("<taskId>", "Task ID or task run ID")
  .requiredOption("--reason <reason>", "Rejection reason")
  .requiredOption("--approval-token <approvalToken>", "Approval token")
  .option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local")
  .action(async (taskId: string, options: { readonly reason: string; readonly approvalToken: string; readonly rejectedBy: string }) => {
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).rejectTask(taskId, { decided_by: options.rejectedBy, reason: options.reason, approval_token: options.approvalToken }), null, 2));
  });

program
  .command("approval-token")
  .description("Derive the approval token for an approval request ID using the local approval secret.")
  .argument("<approvalRequestId>", "Approval request ID")
  .action((approvalRequestId: string) => {
    console.log(approvalTokenForRequest(approvalRequestId));
  });

const approval = program.command("approval").description("Approve or reject local approval requests.");

approval.command("approve")
  .argument("<approvalId>", "Approval request ID")
  .requiredOption("--reason <reason>", "Approval reason")
  .option("--approved-by <approvedBy>", "Approver identifier", "human-local")
  .action(async (approvalId: string, options: { readonly reason: string; readonly approvedBy: string }) => {
    console.log(JSON.stringify(await approveApprovalRequest({ approval_id: approvalId, reason: options.reason, approved_by: options.approvedBy }), null, 2));
  });

approval.command("reject")
  .argument("<approvalId>", "Approval request ID")
  .requiredOption("--reason <reason>", "Rejection reason")
  .option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local")
  .action(async (approvalId: string, options: { readonly reason: string; readonly rejectedBy: string }) => {
    console.log(JSON.stringify(await rejectApprovalRequest({ approval_id: approvalId, reason: options.reason, rejected_by: options.rejectedBy }), null, 2));
  });

program.command("run-demo").description("Submit the README summary demo.").action(async () => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).submitProject({ goal: "Create a short README summary for this repository." }), null, 2));
});

const demo = program.command("demo").description("Advanced/dev sample Planfile and fixture flows.");

demo.command("list").action(() => {
  console.log(JSON.stringify(listDemos(), null, 2));
});

demo.command("run")
  .argument("<demoId>", "Demo ID")
  .option("--dry-run", "Run without real side effects", true)
  .option("--live", "Run supported demos through live local execution in isolated fixtures", false)
  .option("--output-dir <path>", "Write artifacts to a chosen directory")
  .option("--stdout-only", "Print summaries without writing artifacts", false)
  .option("--clean", "Remove prior demo artifacts for this demo before running", false)
  .action(async (demoId: string, options: { readonly dryRun: boolean; readonly live: boolean; readonly outputDir?: string; readonly stdoutOnly: boolean; readonly clean: boolean }) => {
    if (options.live && demoId !== "repo-json-output") throw new Error("Live local execution is currently available for repo-json-output only.");
    console.log(JSON.stringify(await runDemo({
      demo_id: demoId,
      dry_run: !options.live,
      ...(options.outputDir ? { output_dir: options.outputDir } : {}),
      stdout_only: options.stdoutOnly,
      clean: options.clean,
    }), null, 2));
  });

demo.command("open").argument("<demoId>", "Demo ID").action((demoId: string) => {
  console.log(JSON.stringify(openDemo(demoId), null, 2));
});

const artifact = program.command("artifact").description("Inspect Planfile run artifacts.");

artifact.command("list")
  .option("--run <runId>", "Show artifacts for a run ID, or latest")
  .option("--plan <planId>", "Show artifacts for a repository plan ID")
  .option("--role <role>", "Filter run artifacts by role: primary_output, supporting_evidence, debug_log")
  .option("--limit <count>", "Limit flat artifact results", parsePositiveInt, 50)
  .action((options: { readonly run?: string; readonly plan?: string; readonly role?: string; readonly limit: number }) => {
    if (options.run) {
      console.log(JSON.stringify(listRunArtifacts({ run_id: options.run, ...(options.role ? { role: artifactRole(options.role) } : {}) }), null, 2));
      return;
    }
    if (options.plan) {
      console.log(JSON.stringify(listArtifactsForPlan(options.plan), null, 2));
      return;
    }
    console.log(JSON.stringify(listArtifacts().slice(-options.limit), null, 2));
  });

artifact.command("recent")
  .option("--limit <count>", "Number of recent high-signal artifacts", parsePositiveInt, 12)
  .option("--include-debug", "Include debug artifacts", false)
  .action((options: { readonly limit: number; readonly includeDebug: boolean }) => {
    console.log(JSON.stringify(recentArtifacts({ limit: options.limit, include_debug: options.includeDebug }), null, 2));
  });

artifact.command("show").argument("<artifactId>", "Artifact ID").action((artifactId: string) => {
  const result = showArtifact(artifactId);
  if (!result) {
    console.log(JSON.stringify({ artifact_id: artifactId, status: "missing" }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result, null, 2));
});

artifact.command("export")
  .argument("<artifactId>", "Artifact ID")
  .requiredOption("--output <path>", "Output path")
  .option("--format <format>", "markdown, html, pdf, or json")
  .action(async (artifactId: string, options: { readonly output: string; readonly format?: string }) => {
    if (!options.format || options.format === "json") {
      console.log(JSON.stringify(exportArtifact({ artifact_id: artifactId, output_path: options.output }), null, 2));
      return;
    }
    if (options.format === "markdown") {
      const rendered = await runOutputRenderMarkdownCommand({ source_artifact_id: artifactId, normalize: true });
      const output = rendered.result && typeof rendered.result === "object" ? rendered.result as { readonly artifact_id?: string } : {};
      if (!output.artifact_id) throw new Error(`Markdown export failed for artifact ${artifactId}`);
      console.log(JSON.stringify({ rendered, exported: exportArtifact({ artifact_id: output.artifact_id, output_path: options.output }) }, null, 2));
      return;
    }
    if (options.format === "html") {
      const rendered = await runOutputRenderHtmlCommand({ source_markdown_artifact_id: artifactId, include_basic_styles: true });
      const output = rendered.result && typeof rendered.result === "object" ? rendered.result as { readonly artifact_id?: string } : {};
      if (!output.artifact_id) throw new Error(`HTML export failed for artifact ${artifactId}`);
      console.log(JSON.stringify({ rendered, exported: exportArtifact({ artifact_id: output.artifact_id, output_path: options.output }) }, null, 2));
      return;
    }
    if (options.format === "pdf") {
      console.log(JSON.stringify(await runOutputRenderPdfCommand({ source_markdown_artifact_id: artifactId }), null, 2));
      return;
    }
    throw new Error(`Unsupported artifact export format: ${options.format}`);
  });

const output = program.command("output").description("Select, render, bundle, and export run artifacts.");

output.command("select")
  .requiredOption("--run <runId>", "Run ID")
  .option("--preset <preset>", "final_outputs, research_packet, developer_packet, debug_packet, or all_safe", "final_outputs")
  .option("--include-model-calls", "Include model-call summaries", false)
  .option("--include-raw-logs", "Include raw logs when policy allows", false)
  .action(async (options: { readonly run: string; readonly preset: "final_outputs" | "research_packet" | "developer_packet" | "debug_packet" | "all_safe"; readonly includeModelCalls: boolean; readonly includeRawLogs: boolean }) => {
    console.log(JSON.stringify(await runOutputSelectCommand({
      run_id: options.run,
      preset: options.preset,
      include_model_calls: options.includeModelCalls,
      include_raw_logs: options.includeRawLogs,
      include_redacted_only: true,
      max_artifacts: 50,
    }), null, 2));
  });

output.command("digest")
  .requiredOption("--run <runId>", "Run ID")
  .option("--style <style>", "concise, executive, developer, or research", "concise")
  .option("--max-words <count>", "Maximum words", parsePositiveInt, 400)
  .option("--deterministic", "Skip model synthesis and use deterministic artifact summaries", false)
  .option("--model", "Prefer configured model synthesis", false)
  .option("--model-route <routeId>", "Model route ID")
  .action(async (options: { readonly run: string; readonly style: "concise" | "executive" | "developer" | "research"; readonly maxWords: number; readonly deterministic: boolean; readonly model: boolean; readonly modelRoute?: string }) => {
    console.log(JSON.stringify(await runOutputDigestCommand({
      run_id: options.run,
      digest_style: options.style,
      max_words: options.maxWords,
      deterministic: options.deterministic,
      model: options.model,
      ...(options.modelRoute ? { model_route_id: options.modelRoute } : {}),
    }), null, 2));
  });

output.command("packet")
  .requiredOption("--run <runId>", "Run ID")
  .option("--type <type>", "research, developer, debug, or general", "general")
  .option("--include-model-calls", "Include model-call summaries", false)
  .option("--include-raw-logs", "Include raw logs when policy allows", false)
  .option("--deterministic", "Skip model synthesis and use deterministic artifact summaries", false)
  .option("--model", "Prefer configured model synthesis", false)
  .action(async (options: { readonly run: string; readonly type: "research" | "developer" | "debug" | "general"; readonly includeModelCalls: boolean; readonly includeRawLogs: boolean; readonly deterministic: boolean; readonly model: boolean }) => {
    console.log(JSON.stringify(await runOutputPacketCommand({
      run_id: options.run,
      packet_type: options.type,
      include_timeline: true,
      include_model_calls: options.includeModelCalls,
      include_policy_reports: false,
      include_raw_logs: options.includeRawLogs,
      deterministic: options.deterministic,
      model: options.model,
    }), null, 2));
  });

output.command("render-markdown").argument("<artifactId>", "Artifact ID").action(async (artifactId: string) => {
  console.log(JSON.stringify(await runOutputRenderMarkdownCommand({ source_artifact_id: artifactId, normalize: true }), null, 2));
});

output.command("render-html").argument("<artifactId>", "Markdown artifact ID").action(async (artifactId: string) => {
  console.log(JSON.stringify(await runOutputRenderHtmlCommand({ source_markdown_artifact_id: artifactId, include_basic_styles: true }), null, 2));
});

output.command("render-pdf").argument("<artifactId>", "Markdown or HTML artifact ID").action(async (artifactId: string) => {
  console.log(JSON.stringify(await runOutputRenderPdfCommand({ source_markdown_artifact_id: artifactId }), null, 2));
});

output.command("export")
  .requiredOption("--run <runId>", "Run ID")
  .option("--preset <preset>", "final_outputs, research_packet, developer_packet, debug_packet, or all_safe", "final_outputs")
  .requiredOption("--format <format>", "directory, zip, or json_manifest")
  .option("--output <path>", "Output directory or ZIP path")
  .action(async (options: { readonly run: string; readonly preset: "final_outputs" | "research_packet" | "developer_packet" | "debug_packet" | "all_safe"; readonly format: "directory" | "zip" | "json_manifest"; readonly output?: string }) => {
    const selected = await runOutputSelectCommand({ run_id: options.run, preset: options.preset, include_model_calls: false, include_raw_logs: false, include_redacted_only: true, max_artifacts: 50 });
    const result = selected.result as { readonly selected_artifacts?: readonly { readonly artifact_id: string }[] };
    const artifactIds = result.selected_artifacts?.map((artifact) => artifact.artifact_id) ?? [];
    console.log(JSON.stringify(await runOutputExportCommand({
      artifact_ids: artifactIds,
      format: options.format,
      include_manifest: true,
      ...(options.output ? { output_path: options.output } : {}),
    }), null, 2));
  });

output.command("manifest").requiredOption("--run <runId>", "Run ID").action(async (options: { readonly run: string }) => {
  const selected = await runOutputSelectCommand({ run_id: options.run, preset: "all_safe", include_model_calls: false, include_raw_logs: false, include_redacted_only: true, max_artifacts: 50 });
  const result = selected.result as { readonly selected_artifacts?: readonly { readonly artifact_id: string }[] };
  console.log(JSON.stringify(await runOutputManifestCommand({ artifact_ids: result.selected_artifacts?.map((artifact) => artifact.artifact_id) ?? [], include_lineage: true, include_checksums: true }), null, 2));
});

artifact.command("reindex").action(() => {
  console.log(JSON.stringify(reindexArtifacts(), null, 2));
});

artifact.command("prune")
  .requiredOption("--older-than <duration>", "Prune indexed artifacts older than a duration such as 7d, 24h, or 30m")
  .action((options: { readonly olderThan: string }) => {
    console.log(JSON.stringify(pruneArtifacts({ older_than: options.olderThan }), null, 2));
  });

const run = program.command("run").description("Inspect Planfile run outputs.");

run.command("list").option("--limit <count>", "Number of recent runs", parsePositiveInt, 20).action((options: { readonly limit: number }) => {
  console.log(JSON.stringify([...listRuns()].slice(-options.limit), null, 2));
});

run.command("show").argument("<runId>", "Run ID, or latest").action((runId: string) => {
  const result = showRun(runId);
  if (!result) {
    console.log(JSON.stringify({ run_id: runId, status: "missing" }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result, null, 2));
});

run.command("status").argument("<runId>", "Run ID").action(async (runId: string) => {
  const snapshot = await buildRunSnapshot({ run_id: runId });
  if (!snapshot) {
    console.log(JSON.stringify({ run_id: runId, status: "missing" }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(snapshot, null, 2));
});

run.command("events").argument("<runId>", "Run ID").action(async (runId: string) => {
  console.log(JSON.stringify({ run_id: runId, events: await getStateStore().listRunEvents(runId) }, null, 2));
});

run.command("watch")
  .argument("<runId>", "Run ID")
  .option("--after <eventId>", "Resume after an event ID")
  .option("--json", "Print full event envelopes as JSON lines", false)
  .option("--follow", "Keep watching after a terminal event", false)
  .action(async (runId: string, options: { readonly after?: string; readonly json: boolean; readonly follow: boolean }) => {
    const client = await createPlatformClientFromCurrentProfile();
    const controller = new AbortController();
    const seen = new Set<string>();
    let cursor = options.after;
    const print = (envelope: RunEventWatchEnvelope): void => {
      if (seen.has(envelope.event_id)) return;
      seen.add(envelope.event_id);
      cursor = envelope.event_id;
      if (options.json) console.log(JSON.stringify(envelope));
      else console.log(`${envelope.sequence} ${envelope.timestamp} ${envelope.event.type} ${envelope.event_id}`);
      if (!options.follow && terminalRunEvent(envelope.event.type)) controller.abort();
    };
    await client.streamRunEvents(runId, {
      ...(cursor ? { afterEventId: cursor } : {}),
      signal: controller.signal,
      onEvent: (envelope) => print(envelope as unknown as RunEventWatchEnvelope),
      onError: (error) => {
        if (!controller.signal.aborted) console.error(`stream error: ${error.message}`);
      },
      onReconnect: async (attempt) => {
        if (attempt < 3 || controller.signal.aborted) return;
        const data = await client.getRunEvents(runId, { ...(cursor ? { after: cursor } : {}) }) as { readonly events?: readonly RunEventWatchEnvelope[] };
        for (const envelope of data.events ?? []) print(envelope);
      },
    });
  });

run.command("explain").argument("<runId>", "Run ID").action(async (runId: string) => {
  const snapshot = await buildRunSnapshot({ run_id: runId });
  if (!snapshot) {
    console.log(`Run not found: ${runId}`);
    process.exitCode = 1;
    return;
  }
  console.log([
    `${snapshot.plan_title} (${snapshot.run_id})`,
    `Status: ${snapshot.status}`,
    snapshot.active_node_id ? `Active node: ${snapshot.active_node_id}` : "Active node: none",
    `Nodes: ${snapshot.nodes.map((node) => `${node.node_id}=${node.status}`).join(", ")}`,
    `Artifacts: ${snapshot.artifacts.length}`,
    `Approvals: ${snapshot.approvals.length}`,
    `Model calls: ${snapshot.model_calls.length}`,
    `Next: ${snapshot.next_actions.map((action) => action.command ?? action.label).join(" | ") || "none"}`,
  ].join("\n"));
});

run.command("artifacts").argument("<runId>", "Run ID").action(async (runId: string) => {
  const snapshot = await buildRunSnapshot({ run_id: runId });
  if (!snapshot) {
    console.log(JSON.stringify({ run_id: runId, status: "missing" }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ run_id: runId, artifacts: snapshot.artifacts }, null, 2));
});

run.command("resume").argument("<runId>", "Run ID").action(async (runId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).resumeRun(runId), null, 2));
});

run.command("retry")
  .argument("<runId>", "Run ID")
  .argument("<nodeId>", "Node ID")
  .requiredOption("--mode <mode>", "Replay mode: reuse-artifacts, refresh-artifacts, or force-new-idempotency-key")
  .action(async (runId: string, nodeId: string, options: { readonly mode: string }) => {
    apiReplayMode(options.mode);
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).retryRunNode(runId, nodeId, options.mode as "reuse-artifacts" | "refresh-artifacts" | "force-new-idempotency-key"), null, 2));
  });

run.command("cancel").argument("<runId>", "Run ID").action(async (runId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).cancelRun(runId), null, 2));
});

run.command("outputs")
  .argument("<runId>", "Run ID, or latest")
  .option("--include-supporting", "Include supporting artifacts", false)
  .option("--include-debug", "Include debug artifacts", false)
  .action((runId: string, options: { readonly includeSupporting: boolean; readonly includeDebug: boolean }) => {
    const primary = listRunArtifacts({ run_id: runId, role: "primary_output" });
    const supporting = options.includeSupporting ? listRunArtifacts({ run_id: runId, role: "supporting_evidence" }) : [];
    const debug = options.includeDebug ? listRunArtifacts({ run_id: runId, role: "debug_log" }) : [];
    console.log(JSON.stringify({ run_id: runId, primary, supporting, debug }, null, 2));
  });

const pack = program.command("pack").description("Build, inspect, and validate capability packs.");

pack.command("list").option("--profile <name>", "Runtime profile to read installed packs from").action(async (options: { readonly profile?: string }) => {
  console.log(JSON.stringify(listInspectablePacks(getProfilePackPaths(options.profile ?? (await getCurrentProfile().catch(() => ({ name: "local" }))).name).profileDir), null, 2));
});

pack.command("build")
  .argument("<skillfile>", "skills.md path")
  .option("--dry-run", "Generate and validate without installing", true)
  .option("--output-dir <path>", "Generated pack parent directory")
  .option("--experimental-codegen", "Reserved flag for future model-assisted source generation", false)
  .action(async (path: string, options: { readonly dryRun: boolean; readonly outputDir?: string; readonly experimentalCodegen: boolean }) => {
    const result = await buildGeneratedPackFromMarkdown({
      markdown: await readFile(cliPath(path), "utf8"),
      dry_run: options.dryRun,
      output_dir: options.outputDir ? cliPath(options.outputDir) : cliPath(".open-lagrange/generated-packs"),
      experimental_codegen: options.experimentalCodegen,
    });
    console.log(JSON.stringify(result, null, 2));
  });

pack.command("scaffold").argument("<packId>", "Generated pack ID, such as local.http-json-fetcher").option("--output-dir <path>", "Generated pack parent directory").action((packId: string, options: { readonly outputDir?: string }) => {
  console.log(JSON.stringify(scaffoldGeneratedPack({ pack_id: packId, output_dir: options.outputDir ? cliPath(options.outputDir) : cliPath(".open-lagrange/generated-packs") }), null, 2));
});

pack.command("inspect").argument("<packIdOrPath>", "Pack ID or generated pack path").option("--profile <name>", "Runtime profile to read installed packs from").action(async (packIdOrPath: string, options: { readonly profile?: string }) => {
  const target = packTarget(packIdOrPath);
  const result = inspectPack(target, getProfilePackPaths(options.profile ?? (await getCurrentProfile().catch(() => ({ name: "local" }))).name).profileDir);
  if (!result) {
    console.log(JSON.stringify({ pack_id: packIdOrPath, status: "missing" }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result, null, 2));
});

pack.command("validate").argument("<packIdOrPath>", "Pack ID or generated pack path").action((packIdOrPath: string) => {
  const target = packTarget(packIdOrPath);
  const result = existsSync(target) ? validateGeneratedPack({ pack_path: target }) : validateRegisteredPack(target);
  console.log(JSON.stringify(result, null, 2));
  const ok = "ok" in result ? result.ok : result.status === "pass";
  if (!ok) process.exitCode = 1;
});

pack.command("install")
  .argument("<packPath>", "Generated pack directory")
  .option("--allow-manual-review-install", "Install a pack that requires manual review", false)
  .option("--profile <name>", "Runtime profile to install into")
  .option("--install-dir <path>", "Explicit install root. The registry is written under <path>/packs/registry.json")
  .option("--workspace-local", "Install into this workspace's .open-lagrange directory instead of the active profile", false)
  .action(async (packPath: string, options: { readonly allowManualReviewInstall: boolean; readonly profile?: string; readonly installDir?: string; readonly workspaceLocal: boolean }) => {
    const homeDir = options.installDir
      ? cliPath(options.installDir)
      : options.workspaceLocal
        ? cliPath(".open-lagrange")
        : getProfilePackPaths(options.profile ?? (await getCurrentProfile()).name).profileDir;
    console.log(JSON.stringify(installGeneratedPack({ pack_path: cliPath(packPath), home_dir: homeDir, allow_manual_review_install: options.allowManualReviewInstall }), null, 2));
  });

pack.command("health")
  .argument("[packId]", "Pack ID")
  .option("--profile <name>", "Runtime profile to read installed packs from")
  .option("--workspace-local", "Read installed packs from this workspace's .open-lagrange directory", false)
  .action(async (packId: string | undefined, options: { readonly profile?: string; readonly workspaceLocal: boolean }) => {
    const profileName = options.profile ?? (await getCurrentProfile().catch(() => ({ name: "local" }))).name;
    const packsDir = options.workspaceLocal ? cliPath(".open-lagrange/packs") : getProfilePackPaths(profileName).packsDir;
    console.log(JSON.stringify(getPackHealth({ ...(packId ? { pack_id: packId } : {}), packs_dir: packsDir, configured_secret_refs: await currentSecretRefNames() }), null, 2));
  });

pack.command("smoke")
  .argument("<packId>", "Pack ID")
  .option("--profile <name>", "Runtime profile to read installed packs from")
  .option("--workspace-local", "Read installed packs from this workspace's .open-lagrange directory", false)
  .action(async (packId: string, options: { readonly profile?: string; readonly workspaceLocal: boolean }) => {
    const profileName = options.profile ?? (await getCurrentProfile().catch(() => ({ name: "local" }))).name;
    const packsDir = options.workspaceLocal ? cliPath(".open-lagrange/packs") : getProfilePackPaths(profileName).packsDir;
    console.log(JSON.stringify(await runPackSmoke({ pack_id: packId, packs_dir: packsDir }), null, 2));
  });

const profile = program.command("profile").description("Manage runtime profiles.");

profile.command("list").description("List profiles.").action(async () => {
  console.log(JSON.stringify(await loadConfig(), null, 2));
});

profile.command("current").description("Show the current profile.").action(async () => {
  console.log(JSON.stringify(await getCurrentProfile(), null, 2));
});

profile.command("use").argument("<name>", "Profile name").description("Switch current profile.").action(async (name: string) => {
  console.log(JSON.stringify(await setCurrentProfile(name), null, 2));
});

profile.command("add-local").argument("<name>", "Profile name").requiredOption("--runtime <runtime>", "docker or podman").option("--with-search", "Configure a local SearXNG search provider", false).description("Add a local profile.").action(async (name: string, options: { readonly runtime: string; readonly withSearch: boolean }) => {
  console.log(JSON.stringify(await addLocalProfile(name, runtimeOption(options.runtime) ?? "podman", { withSearch: options.withSearch }), null, 2));
});

profile.command("add-remote").argument("<name>", "Profile name").requiredOption("--api-url <url>", "Control Plane API URL").description("Add a remote profile.").action(async (name: string, options: { readonly apiUrl: string }) => {
  console.log(JSON.stringify(await addRemoteProfile(name, options.apiUrl), null, 2));
});

profile.command("remove").argument("<name>", "Profile name").description("Remove a profile.").action(async (name: string) => {
  console.log(JSON.stringify(await removeProfile(name), null, 2));
});

const secrets = program.command("secrets").description("Manage profile secret references.");

secrets.command("set")
  .argument("<name>", "Secret name, such as openai or open_lagrange_token")
  .option("--provider <provider>", "os-keychain or env", "os-keychain")
  .option("--from-stdin", "Read secret value from stdin", false)
  .action(async (name: string, options: { readonly provider: string; readonly fromStdin: boolean }) => {
    const value = requireSecretInput(
      options.fromStdin ? await readStdin() : await promptSecretValue(`Secret value for ${name}: `),
      options.fromStdin
        ? `No secret value was read from stdin for ${name}. Check that the environment variable you pipe is set.`
        : `Secret value cannot be empty for ${name}.`,
    );
    console.log(JSON.stringify(await setCurrentProfileSecret({ name, value, provider: secretProvider(options.provider) }), null, 2));
  });

secrets.command("get")
  .argument("<name>", "Secret name")
  .option("--redacted", "Show redacted metadata", true)
  .action(async (name: string) => {
    console.log(JSON.stringify(await describeCurrentProfileSecret(name), null, 2));
  });

secrets.command("delete").argument("<name>", "Secret name").action(async (name: string) => {
  console.log(JSON.stringify(await deleteCurrentProfileSecret(name), null, 2));
});

secrets.command("list").action(async () => {
  console.log(JSON.stringify(await listCurrentProfileSecrets(), null, 2));
});

secrets.command("status").action(async () => {
  try {
    const profile = await getCurrentProfile();
    console.log(JSON.stringify({
      profile: profile.name,
      secrets: await listCurrentProfileSecrets(),
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ status: "missing_profile", message: "Run open-lagrange init before configuring secrets." }, null, 2));
  }
});

const auth = program.command("auth").description("Manage profile authentication.");

auth.command("login").option("--from-stdin", "Read token from stdin", false).action(async (options: { readonly fromStdin: boolean }) => {
  const value = requireSecretInput(
    options.fromStdin ? await readStdin() : await promptSecretValue("Open Lagrange token: "),
    options.fromStdin
      ? "No token was read from stdin. Check that the environment variable you pipe is set."
      : "Open Lagrange token cannot be empty.",
  );
  console.log(JSON.stringify(await setCurrentProfileSecret({ name: "open_lagrange_token", value, provider: "os-keychain" }), null, 2));
});

auth.command("logout").action(async () => {
  console.log(JSON.stringify(await deleteCurrentProfileSecret("open_lagrange_token"), null, 2));
});

auth.command("status").action(async () => {
  const profile = await getCurrentProfile().catch(() => undefined);
  if (!profile) {
    console.log(JSON.stringify({ status: "missing_profile", message: "Run open-lagrange init before configuring auth." }, null, 2));
    return;
  }
  try {
    console.log(JSON.stringify(await describeCurrentProfileSecret("open_lagrange_token"), null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ status: "unknown", profile: profile.name, message }, null, 2));
  }
});

const model = program.command("model").description("Manage model provider profiles.");

model.command("providers").description("List known named model providers.").action(() => {
  console.log(JSON.stringify(listKnownModelProviders(), null, 2));
});

model.command("configure")
  .argument("<provider>", "Provider name or alias, such as openai, gpt, openrouter, groq, grok, kimi, minimax, local")
  .option("--endpoint <url>", "Provider endpoint override")
  .option("--model <model>", "Default model name")
  .option("--high-model <model>", "Higher-capability model for planning and complex review")
  .option("--coder-model <model>", "Coder-focused model for bounded implementation work")
  .option("--secret-ref <name>", "Profile secret reference key to use for this provider")
  .option("--inactive", "Configure without making this provider active", false)
  .action(async (provider: string, options: { readonly endpoint?: string; readonly model?: string; readonly highModel?: string; readonly coderModel?: string; readonly secretRef?: string; readonly inactive: boolean }) => {
    console.log(JSON.stringify(await configureCurrentProfileModelProvider({
      provider,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.highModel ? { high_model: options.highModel } : {}),
      ...(options.coderModel ? { coder_model: options.coderModel } : {}),
      ...(options.secretRef ? { secret_ref: options.secretRef } : {}),
      set_active: !options.inactive,
    }), null, 2));
  });

model.command("list").description("List configured model providers for the current profile.").action(async () => {
  console.log(JSON.stringify(await listCurrentProfileModelProviders(), null, 2));
});

model.command("status").description("Show the active model provider status.").action(async () => {
  console.log(JSON.stringify(await describeCurrentProfileModelProvider(), null, 2));
});

const search = program.command("search").description("Inspect configured search providers.");

search.command("providers").description("List search providers for the current profile.").action(async () => {
  const providers = await currentSearchProviderConfigs();
  console.log(JSON.stringify({
    providers: [
      { id: "manual-urls", kind: "manual_urls", mode: "live", configured: true, enabled: true },
      ...await Promise.all(providers.map(async (provider) => {
        const state = provider.kind === "searxng" ? await probeSearchProvider(provider.baseUrl) : "unknown";
        return {
          id: provider.id,
          kind: provider.kind,
          mode: "live",
          configured: provider.enabled !== false,
          enabled: provider.enabled !== false,
          state,
          ...(provider.kind === "searxng" && state === "unreachable" ? { remediation: "Run open-lagrange up --with-search to start the local SearXNG container." } : {}),
          ...(provider.kind === "searxng" ? { baseUrl: provider.baseUrl } : {}),
        };
      })),
    ],
  }, null, 2));
});

search.command("test-provider")
  .argument("<providerId>", "Search provider ID")
  .option("--query <query>", "Test query", "open lagrange")
  .action(async (providerId: string, options: { readonly query: string }) => {
    const configs = await currentSearchProviderConfigs();
    console.log(JSON.stringify(await runResearchSearchCommand({
      query: options.query,
      provider_id: providerId,
      search_provider_configs: configs,
    }), null, 2));
  });

const provider = program.command("provider").description("Inspect profile provider configuration.");

provider.command("list").description("List model and search providers for the current profile.").action(async () => {
  const profile = await getCurrentProfile();
  console.log(JSON.stringify({
    profile: profile.name,
    active_model_provider: profile.activeModelProvider,
    model_providers: Object.keys(profile.modelProviders ?? {}),
    search_providers: [
      { id: "manual-urls", kind: "manual_urls", enabled: true },
      ...(profile.searchProviders ?? []).map((config) => ({
        id: config.id,
        kind: config.kind,
        enabled: config.enabled !== false,
        ...(config.kind === "searxng" ? { baseUrl: config.baseUrl } : {}),
      })),
    ],
  }, null, 2));
});

provider.command("model").description("Show configured model providers for the current profile.").action(async () => {
  console.log(JSON.stringify(await listCurrentProfileModelProviders(), null, 2));
});

provider.command("search").description("Show configured search providers for the current profile.").action(async () => {
  const providers = await currentSearchProviderConfigs();
  console.log(JSON.stringify({
    providers: [
      { id: "manual-urls", kind: "manual_urls", mode: "live", configured: true, enabled: true },
      ...providers.map((config) => ({
        id: config.id,
        kind: config.kind,
        mode: "live",
        configured: config.enabled !== false,
        enabled: config.enabled !== false,
        ...(config.kind === "searxng" ? { baseUrl: config.baseUrl } : {}),
      })),
    ],
  }, null, 2));
});

const repo = program.command("repo").description("Repository shortcuts for Planfile flows.");

repo.command("doctor")
  .requiredOption("--repo <path>", "Repository root")
  .action((options: { readonly repo: string }) => {
    console.log(JSON.stringify(runRepositoryDoctor({ repo_root: options.repo }), null, 2));
  });

repo.command("run")
  .description("Shortcut for composing and running a repository Planfile.")
  .requiredOption("--repo <path>", "Repository root")
  .requiredOption("--goal <goal>", "Repository task goal")
  .option("--workspace-id <workspaceId>", "Repository workspace ID")
  .option("--dry-run", "Plan and require approval before writes", true)
  .option("--apply", "Apply the approved patch immediately", false)
  .option("--require-approval", "Require approval before applying", false)
  .option("--planning-mode <mode>", "deterministic, model, or model-with-fallback", "deterministic")
  .option("--legacy", "Use the original repository task endpoint", false)
  .option("--json", "Print machine-readable output", false)
  .action(async (options: { readonly repo: string; readonly goal: string; readonly workspaceId?: string; readonly dryRun: boolean; readonly apply: boolean; readonly requireApproval: boolean; readonly planningMode: string; readonly legacy: boolean; readonly json: boolean }) => {
    if (!options.legacy) {
      const created = await createRepositoryPlanfile({
        repo_root: options.repo,
        goal: options.goal,
        dry_run: options.dryRun && !options.apply,
        planning_mode: planningModeOption(options.planningMode),
        ...modelRouteForPlanning(options.planningMode),
        ...(options.workspaceId ? { workspace_id: options.workspaceId } : {}),
      });
      await writeFile(created.path, created.markdown, "utf8");
      if (!options.apply) {
        const payload = { plan_id: created.planfile.plan_id, path: created.path, canonical_plan_digest: created.planfile.canonical_plan_digest, run_command: `open-lagrange repo apply ${created.path}`, status_command: `open-lagrange repo status ${created.planfile.plan_id}` };
        console.log(options.json ? JSON.stringify(payload, null, 2) : [
          `Planfile created: ${payload.plan_id}`,
          `Path: ${payload.path}`,
          "Run:",
          `  ${payload.run_command}`,
          "Inspect:",
          `  ${payload.status_command}`,
        ].join("\n"));
        return;
      }
      const status = await applyLocalRepositoryPlanfile({
        planfile: created.planfile,
        allow_dirty_base: false,
        retain_on_failure: true,
      });
      const view = await buildRepositoryRunView({ ref: status.plan_id, status });
      console.log(options.json ? JSON.stringify(view ?? status, null, 2) : view ? formatRepositoryStatus(view) : JSON.stringify(status, null, 2));
      return;
    }
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).submitRepositoryGoal({
      goal: options.goal,
      repo_root: options.repo,
      ...(options.workspaceId ? { workspace_id: options.workspaceId } : {}),
      dry_run: options.dryRun && !options.apply,
      apply: options.apply,
      require_approval: options.requireApproval,
    }), null, 2));
  });

repo.command("plan")
  .description("Compose a repository Planfile.")
  .requiredOption("--repo <path>", "Repository root")
  .requiredOption("--goal <goal>", "Repository task goal")
  .option("--workspace-id <workspaceId>", "Repository workspace ID")
  .option("--dry-run", "Create a dry-run Planfile", true)
  .option("--planning-mode <mode>", "deterministic, model, or model-with-fallback", "deterministic")
  .action(async (options: { readonly repo: string; readonly goal: string; readonly workspaceId?: string; readonly dryRun: boolean; readonly planningMode: string }) => {
    const created = await createRepositoryPlanfile({
      repo_root: options.repo,
      goal: options.goal,
      dry_run: options.dryRun,
      planning_mode: planningModeOption(options.planningMode),
      ...modelRouteForPlanning(options.planningMode),
      ...(options.workspaceId ? { workspace_id: options.workspaceId } : {}),
    });
    await writeFile(created.path, created.markdown, "utf8");
    console.log(JSON.stringify({ plan_id: created.planfile.plan_id, path: created.path, canonical_plan_digest: created.planfile.canonical_plan_digest }, null, 2));
  });

repo.command("apply")
  .argument("<planfile>", "Repository Planfile Markdown or YAML path")
  .option("--retain-worktree", "Retain the isolated worktree after execution", false)
  .option("--allow-dirty-base", "Allow execution when the source worktree has uncommitted changes", false)
  .option("--cleanup-on-success", "Allow cleanup policy to remove retained worktrees later", false)
  .option("--json", "Print machine-readable output", false)
  .action(async (path: string, options: { readonly retainWorktree: boolean; readonly allowDirtyBase: boolean; readonly cleanupOnSuccess: boolean; readonly json: boolean }) => {
    const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
    const check = runPlanCheck({ planfile, live: true });
    if (planCheckBlocksRun(check)) {
      console.log(JSON.stringify({ status: "blocked", plan_check_report: check }, null, 2));
      process.exitCode = 1;
      return;
    }
    const status = await applyLocalRepositoryPlanfile({
      planfile,
      allow_dirty_base: options.allowDirtyBase,
      retain_on_failure: options.retainWorktree || !options.cleanupOnSuccess,
    });
    const view = await buildRepositoryRunView({ ref: status.plan_id, status });
    console.log(options.json ? JSON.stringify(view ?? status, null, 2) : view ? formatRepositoryStatus(view) : JSON.stringify(status, null, 2));
  });

repo.command("status").argument("<planId>", "Plan ID, task ID, or task run ID").option("--json", "Print machine-readable output", false).action(async (planId: string, options: { readonly json: boolean }) => {
  const view = await buildRepositoryRunView({ ref: planId });
  if (view) {
    console.log(options.json ? JSON.stringify(view, null, 2) : formatRepositoryStatus(view));
    return;
  }
  const client = await createPlatformClientFromCurrentProfile().catch(() => undefined);
  const status = await getLocalRepositoryPlanStatus(planId) ?? await client?.getRepositoryPlanStatus(planId);
  if (isMissingStatus(status) && client) console.log(JSON.stringify(await client.getTaskStatus(planId), null, 2));
  else console.log(JSON.stringify(status, null, 2));
});

repo.command("model-calls").argument("<planId>", "Repository plan ID").action((planId: string) => {
  const calls = listRepositoryModelCalls(planId).map((call) => ({
    artifact_id: call.artifact_id,
    role: call.role,
    provider: call.provider,
    model: call.model,
    status: call.status,
    tokens: call.token_usage.total_tokens ?? 0,
    cost_usd: call.cost.provider_reported_cost_usd ?? call.cost.estimated_cost_usd ?? 0,
    latency_ms: call.latency_ms ?? 0,
    output_artifact_refs: call.output_artifact_refs,
  }));
  console.log(JSON.stringify({
    plan_id: planId,
    count: calls.length,
    calls,
    message: calls.length === 0 ? "No model-call telemetry artifacts found for this plan." : undefined,
  }, null, 2));
});

repo.command("explain").argument("<planId>", "Repository plan ID").option("--json", "Print machine-readable output", false).action(async (planId: string, options: { readonly json: boolean }) => {
  const view = await buildRepositoryRunView({ ref: planId });
  if (!view) {
    console.log(JSON.stringify({ plan_id: planId, status: "missing" }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(options.json ? JSON.stringify(view, null, 2) : formatRepositoryExplanation(view));
});

repo.command("resume").argument("<planId>", "Repository plan ID").action(async (planId: string) => {
  console.log(JSON.stringify(await resumeRepositoryPlan({ plan_id: planId }), null, 2));
});

repo.command("evidence").argument("<planId>", "Repository plan ID or run ID").option("--json", "Print machine-readable output", false).action(async (planId: string, options: { readonly json: boolean }) => {
  const view = await buildRepositoryRunView({ ref: planId });
  if (!view) throw new Error(`Repository run not found: ${planId}`);
  console.log(options.json ? JSON.stringify({ run_id: view.run_id, evidence: view.evidence, inspected_files: view.files.inspected }, null, 2) : formatRepositoryEvidence(view));
});

repo.command("verify").argument("<planId>", "Repository plan ID or run ID").option("--json", "Print machine-readable output", false).action(async (planId: string, options: { readonly json: boolean }) => {
  const view = await buildRepositoryRunView({ ref: planId });
  if (!view) throw new Error(`Repository run not found: ${planId}`);
  console.log(options.json ? JSON.stringify({ run_id: view.run_id, verification_reports: view.verification_reports, repair_attempts: view.repair_attempts }, null, 2) : formatRepositoryVerification(view));
});

repo.command("worktree").argument("<planId>", "Repository plan ID or run ID").option("--json", "Print machine-readable output", false).action(async (planId: string, options: { readonly json: boolean }) => {
  const view = await buildRepositoryRunView({ ref: planId });
  if (!view) throw new Error(`Repository run not found: ${planId}`);
  console.log(options.json ? JSON.stringify({ run_id: view.run_id, repo_root: view.repo_root, worktree_path: view.worktree_path, branch_name: view.branch_name, base_ref: view.base_ref, base_commit: view.base_commit, status: view.worktree_status }, null, 2) : formatRepositoryWorktree(view));
});

repo.command("diff").argument("<taskId>", "Task ID, plan ID, or run ID").option("--json", "Print machine-readable output", false).action(async (taskId: string, options: { readonly json: boolean }) => {
  const view = await buildRepositoryRunView({ ref: taskId });
  if (view) {
    console.log(options.json ? JSON.stringify(buildRepositoryDiffView(view), null, 2) : formatRepositoryDiff(view));
    return;
  }
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getArtifact("diff", { task_id: taskId, type: "diff" }), null, 2));
});

repo.command("patch")
  .argument("<planId>", "Repository plan ID")
  .option("--output <path>", "Write final patch to a file")
  .option("--json", "Print machine-readable output", false)
  .action(async (planId: string, options: { readonly output?: string; readonly json: boolean }) => {
    const view = await buildRepositoryRunView({ ref: planId });
    const resolvedPlanId = view?.plan_id ?? planId;
    const patch = await exportLocalRepositoryPlanPatch(resolvedPlanId, options.output);
    if (options.output && isPatchArtifact(patch)) {
      const payload = { plan_id: patch.plan_id, output: options.output, changed_files: patch.changed_files, apply_command: `git apply ${options.output}` };
      console.log(options.json ? JSON.stringify(payload, null, 2) : [
        `Final patch exported: ${options.output}`,
        `Files: ${patch.changed_files.length}`,
        "Apply manually:",
        `  ${payload.apply_command}`,
      ].join("\n"));
      return;
    }
    console.log(isPatchArtifact(patch) ? patch.unified_diff : JSON.stringify(patch, null, 2));
  });

repo.command("review").argument("<planId>", "Plan ID, task ID, or task run ID").action(async (planId: string) => {
  const client = await createPlatformClientFromCurrentProfile();
  const review = await client.getRepositoryPlanReview(planId);
  if (isMissingStatus(review)) console.log(JSON.stringify(await client.getArtifact("review", { task_id: planId, type: "review" }), null, 2));
  else console.log(JSON.stringify(review, null, 2));
});

repo.command("cleanup").argument("<planId>", "Repository plan ID").option("--json", "Print machine-readable output", false).action(async (planId: string, options: { readonly json: boolean }) => {
  const view = await buildRepositoryRunView({ ref: planId });
  const result = await cleanupLocalRepositoryPlan(view?.plan_id ?? planId);
  console.log(options.json ? JSON.stringify(result, null, 2) : [
    `Repository cleanup: ${result.plan_id}`,
    `Cleaned: ${result.cleaned ? "yes" : "no"}`,
    ...(result.worktree_path ? [`Worktree: ${result.worktree_path}`] : []),
  ].join("\n"));
});

const repoScope = repo.command("scope").description("Approve or reject repository scope expansion requests.");

repoScope.command("approve")
  .argument("<requestId>", "Scope expansion request ID")
  .requiredOption("--reason <reason>", "Approval reason")
  .option("--approved-by <approvedBy>", "Approver identifier", "human-local")
  .action(async (requestId: string, options: { readonly reason: string; readonly approvedBy: string }) => {
    console.log(JSON.stringify(await approveRepositoryScopeRequest({ request_id: requestId, reason: options.reason, approved_by: options.approvedBy }), null, 2));
  });

repoScope.command("reject")
  .argument("<requestId>", "Scope expansion request ID")
  .requiredOption("--reason <reason>", "Rejection reason")
  .option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local")
  .action(async (requestId: string, options: { readonly reason: string; readonly rejectedBy: string }) => {
    console.log(JSON.stringify(await rejectRepositoryScopeRequest({ request_id: requestId, reason: options.reason, rejected_by: options.rejectedBy }), null, 2));
  });

const evalCommand = program.command("eval").description("Advanced/dev harnesses around Planfiles and fixtures.");

evalCommand.command("list").action(() => {
  console.log(JSON.stringify(listBenchmarkScenarios(), null, 2));
});

evalCommand.command("scenarios").action(() => {
  console.log(JSON.stringify(listBenchmarkScenarios(), null, 2));
});

evalCommand.command("routes").action(() => {
  console.log(JSON.stringify(listModelRouteConfigs(), null, 2));
});

evalCommand.command("run")
  .argument("<benchmarkId>", "Benchmark ID")
  .option("--mock-models", "Use deterministic fixture model outputs", false)
  .option("--live-models", "Use configured live model providers", false)
  .option("--scenario <scenarioId>", "Run one scenario")
  .option("--route <routeId>", "Run one model route")
  .option("--max-scenarios <count>", "Limit number of scenarios", parsePositiveInt)
  .option("--planning-mode <mode>", "deterministic, model, or model-with-fallback")
  .option("--retain-worktrees", "Keep eval fixture workspaces", false)
  .option("--yes", "Acknowledge live provider cost", false)
  .option("--output-dir <path>", "Write benchmark artifacts to a selected directory")
  .action(async (benchmarkId: string, options: { readonly mockModels: boolean; readonly liveModels: boolean; readonly scenario?: string; readonly route?: string; readonly maxScenarios?: number; readonly planningMode?: string; readonly retainWorktrees: boolean; readonly yes: boolean; readonly outputDir?: string }) => {
    if (benchmarkId !== "repo-plan-to-patch") throw new Error(`Unknown benchmark: ${benchmarkId}`);
    const mode = options.liveModels ? "live" : "mock";
    if (!options.liveModels && !options.mockModels) {
      console.error("No model mode specified. Defaulting to --mock-models.");
    }
    if (options.liveModels && !options.yes) throw new Error("Live model evals may call configured providers. Re-run with --yes to acknowledge cost.");
    console.log(JSON.stringify(await runModelRoutingBenchmark({
      benchmark_id: benchmarkId,
      mode,
      ...(options.scenario ? { scenario_id: options.scenario } : {}),
      ...(options.route ? { route_id: options.route } : {}),
      ...(options.maxScenarios === undefined ? {} : { max_scenarios: options.maxScenarios }),
      ...(options.planningMode ? { planning_mode: planningModeOption(options.planningMode) } : {}),
      retain_worktrees: options.retainWorktrees,
      yes: options.yes,
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    }), null, 2));
  });

evalCommand.command("report").argument("<runId>", "Benchmark run ID").action((runId: string) => {
  console.log(renderBenchmarkReport(runId));
});

evalCommand.command("compare").argument("<runId>", "Benchmark run ID").action((runId: string) => {
  console.log(compareBenchmarkRun(runId));
});

repo.command("approve").argument("<taskId>", "Task ID or task run ID").requiredOption("--reason <reason>", "Approval reason").requiredOption("--approval-token <approvalToken>", "Approval token").option("--approved-by <approvedBy>", "Approver identifier", "human-local").action(async (taskId: string, options: { readonly reason: string; readonly approvalToken: string; readonly approvedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).approveTask(taskId, { decided_by: options.approvedBy, reason: options.reason, approval_token: options.approvalToken }), null, 2));
});

repo.command("reject").argument("<taskId>", "Task ID or task run ID").requiredOption("--reason <reason>", "Rejection reason").requiredOption("--approval-token <approvalToken>", "Approval token").option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local").action(async (taskId: string, options: { readonly reason: string; readonly approvalToken: string; readonly rejectedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).rejectTask(taskId, { decided_by: options.rejectedBy, reason: options.reason, approval_token: options.approvalToken }), null, 2));
});

const research = program.command("research").description("Research shortcuts for Planfile flows.");

research.command("plan")
  .description("Compose a reusable research Planfile.")
  .argument("<topic>", "Research topic")
  .option("--provider <providerId>", "Search provider ID, such as local-searxng")
  .option("--max-sources <count>", "Maximum sources to select", "5")
  .option("--brief-style <style>", "concise, standard, technical, or executive", "standard")
  .option("--write [path]", "Write Markdown Planfile")
  .action(async (topic: string, options: { readonly provider?: string; readonly maxSources: string; readonly briefStyle: "concise" | "standard" | "technical" | "executive"; readonly write?: string | boolean }) => {
    const profile = await getCurrentProfile().catch(() => undefined);
    const result = await composeResearchPlan({
      topic,
      ...(options.provider ? { provider_id: options.provider } : {}),
      max_sources: Number.parseInt(options.maxSources, 10),
      brief_style: options.briefStyle,
      ...(profile ? { runtime_profile: profile } : {}),
    });
    if (options.write) {
      const path = typeof options.write === "string" ? cliPath(options.write) : undefined;
      const written = writeResearchPlanfile({ markdown: result.markdown, ...(path ? { path } : {}), topic });
      console.log(JSON.stringify({ status: "written", path: written.path, plan_id: result.planfile.plan_id, plan_check_report: result.plan_check_report }, null, 2));
      return;
    }
    console.log(result.markdown);
  });

research.command("search")
  .description("Shortcut for bounded research source discovery.")
  .argument("<query>", "Research query")
  .option("--provider <providerId>", "Search provider ID, such as local-searxng")
  .option("--fixture", "Use deterministic checked-in fixture sources", false)
  .option("--live", "Use live search provider if configured", true)
  .option("--dry-run", "Validate search provider/input without querying sources", false)
  .option("--output-dir <path>", "Artifact output directory")
  .action(async (query: string, options: { readonly provider?: string; readonly fixture: boolean; readonly live: boolean; readonly dryRun: boolean; readonly outputDir?: string }) => {
    console.log(JSON.stringify(await runResearchSearchCommand({
      query,
      mode: options.fixture ? "fixture" : "live",
      ...(options.provider ? { provider_id: options.provider } : {}),
      search_provider_configs: await currentSearchProviderConfigs(),
      dry_run: options.dryRun,
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    }), null, 2));
  });

research.command("fetch")
  .description("Shortcut for a live research source fetch Planfile step.")
  .argument("<url>", "Source URL")
  .option("--fixture", "Resolve URL against deterministic fixture sources", false)
  .option("--dry-run", "Validate URL/policy/capability without fetching", false)
  .option("--output-dir <path>", "Artifact output directory")
  .action(async (url: string, options: { readonly fixture: boolean; readonly dryRun: boolean; readonly outputDir?: string }) => {
    console.log(JSON.stringify(await runResearchFetchCommand({
      url,
      mode: options.fixture ? "fixture" : "live",
      search_provider_configs: await currentSearchProviderConfigs(),
      dry_run: options.dryRun,
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    }), null, 2));
  });

research.command("summarize-url")
  .description("Create and run a URL summary Planfile.")
  .argument("<url>", "Source URL")
  .option("--topic <topic>", "Summary topic")
  .option("--output-dir <path>", "Artifact output directory")
  .action(async (url: string, options: { readonly topic?: string; readonly outputDir?: string }) => {
    const profile = await getCurrentProfile().catch(() => undefined);
    const result = await checkAndCreateResearchRun({
      topic: options.topic ?? url,
      urls: [url],
      ...(profile ? { runtime_profile: profile } : {}),
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    });
    printRunCreationResult(result);
  });

research.command("brief")
  .description("Compose and run a research Planfile.")
  .argument("<topic>", "Brief topic")
  .option("--provider <providerId>", "Search provider ID, such as local-searxng")
  .option("--url <url>", "Use an explicit source URL instead of search provider", collectString, [])
  .option("--max-sources <count>", "Maximum sources to select", "5")
  .option("--brief-style <style>", "concise, standard, technical, or executive", "standard")
  .option("--output-dir <path>", "Artifact output directory")
  .action(async (topic: string, options: { readonly provider?: string; readonly url: readonly string[]; readonly maxSources: string; readonly briefStyle: "concise" | "standard" | "technical" | "executive"; readonly outputDir?: string }) => {
    const profile = await getCurrentProfile().catch(() => undefined);
    const result = await checkAndCreateResearchRun({
      topic,
      ...(options.provider ? { provider_id: options.provider } : {}),
      urls: options.url,
      max_sources: Number.parseInt(options.maxSources, 10),
      brief_style: options.briefStyle,
      ...(profile ? { runtime_profile: profile } : {}),
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    });
    printRunCreationResult(result);
  });

research.command("export")
  .argument("<briefId>", "Research brief artifact ID")
  .option("--format <format>", "markdown, source-set-json, or citation-index-json", "markdown")
  .option("--output <path>", "Output file path")
  .action(async (briefId: string, options: { readonly format: string; readonly output?: string }) => {
    if (options.format !== "markdown" && options.format !== "source-set-json" && options.format !== "citation-index-json") {
      throw new Error(`Unsupported research export format: ${options.format}`);
    }
    const output = cliPath(options.output ?? `${briefId}.${options.format === "markdown" ? "md" : "json"}`);
    console.log(JSON.stringify(exportResearchViewArtifact({ artifact_id: briefId, output_path: output }), null, 2));
  });

research.command("show")
  .argument("<runIdOrArtifactId>", "Research run or artifact ID")
  .action(async (id: string) => {
    const view = await buildResearchRunViewForRun({ run_id: id });
    if (view) console.log(JSON.stringify(view, null, 2));
    else console.log(JSON.stringify(showArtifact(id), null, 2));
  });

research.command("sources")
  .argument("<runId>", "Research run ID")
  .action(async (runId: string) => {
    const view = await buildResearchRunViewForRun({ run_id: runId });
    if (!view) throw new Error(`Research run not found: ${runId}`);
    console.log(JSON.stringify({ run_id: runId, source_counts: view.source_counts, sources: view.sources }, null, 2));
  });

research.command("explain")
  .argument("<runId>", "Research run ID")
  .action(async (runId: string) => {
    console.log(await explainResearchRunById(runId));
  });

research.command("schedule")
  .description("Create a checked schedule for a research Planfile.")
  .argument("<topic>", "Research topic")
  .option("--provider <providerId>", "Search provider ID, such as local-searxng")
  .option("--daily", "Run daily", false)
  .option("--weekly", "Run weekly", false)
  .option("--at <time>", "Time of day, for example 08:00")
  .option("--timezone <timezone>", "Schedule timezone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local")
  .action(async (topic: string, options: { readonly provider?: string; readonly daily: boolean; readonly weekly: boolean; readonly at?: string; readonly timezone?: string }) => {
    const profile = await getCurrentProfile().catch(() => undefined);
    const plan = await composeResearchPlan({ topic, ...(options.provider ? { provider_id: options.provider } : {}), ...(profile ? { runtime_profile: profile } : {}) });
    const written = writeResearchPlanfile({ markdown: plan.markdown, topic });
    const schedule = scheduleResearchPlan({
      planfile: plan.planfile,
      planfile_path: written.path,
      cadence: options.weekly ? "weekly" : "daily",
      ...(options.at ? { time_of_day: options.at } : {}),
      ...(options.timezone ? { timezone: options.timezone } : {}),
      runtime_profile: profile?.name ?? "local",
    });
    console.log(JSON.stringify({ plan_id: plan.planfile.plan_id, path: written.path, schedule }, null, 2));
  });

const plan = program.command("plan").description("Author and execute Planfiles.");

plan.command("compose")
  .argument("<prompt>", "Natural language goal to compose into a Planfile")
  .option("--repo <path>", "Repository path for repository work")
  .option("--provider <provider>", "Preferred research search provider")
  .option("--interactive", "Create a collaborative Plan Builder session", false)
  .option("--write", "Write Markdown Planfile to .open-lagrange/plans/<plan_id>.plan.md", false)
  .option("--schedule <cadence>", "Capture a schedule candidate: daily, weekly, or cron")
  .option("--at <time>", "Schedule time, for example 08:00")
  .option("--timezone <timezone>", "Schedule timezone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local")
  .option("--yes", "Create the schedule record when --schedule is provided", false)
  .action(async (prompt: string, options: { readonly repo?: string; readonly provider?: string; readonly interactive: boolean; readonly write: boolean; readonly schedule?: string; readonly at?: string; readonly timezone?: string; readonly yes: boolean }) => {
    const currentProfile = await getCurrentProfile().catch(() => undefined);
    if (options.interactive) {
      const session = await composeInitialPlan({
        prompt,
        ...(currentProfile ? { runtime_profile: currentProfile } : {}),
        context: {
          ...(options.repo ? { repo_path: cliPath(options.repo) } : {}),
          ...(options.provider ? { provider_preference: options.provider } : {}),
          ...(options.schedule ? { schedule_preference: { cadence: scheduleCadence(options.schedule), ...(options.at ? { time_of_day: options.at } : {}), ...(options.timezone ? { timezone: options.timezone } : {}) } } : {}),
        },
      });
      console.log(JSON.stringify(session, null, 2));
      return;
    }
    const composed = await composePlanfileFromIntent({
      prompt,
      ...(currentProfile ? { runtime_profile: currentProfile } : {}),
      mode: "dry_run",
      context: {
        ...(options.repo ? { repo_path: cliPath(options.repo) } : {}),
        ...(options.provider ? { provider_preference: options.provider } : {}),
        ...(options.schedule ? { schedule_preference: { cadence: scheduleCadence(options.schedule), ...(options.at ? { time_of_day: options.at } : {}), ...(options.timezone ? { timezone: options.timezone } : {}) } } : {}),
      },
    });
    if (options.write) {
      const path = join(".open-lagrange", "plans", `${composed.planfile.plan_id}.plan.md`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, composed.markdown, "utf8");
      const schedule = options.schedule && options.yes
        ? checkAndCreateScheduleRecord({
          planfile: composed.planfile,
          planfile_path: path,
          cadence: scheduleCadence(options.schedule),
          ...(options.at ? { time_of_day: options.at } : {}),
          ...(options.timezone ? { timezone: options.timezone } : {}),
          runtime_profile: currentProfile?.name ?? "local",
        })
        : undefined;
      console.log(JSON.stringify({
        plan_id: composed.planfile.plan_id,
        path,
        canonical_plan_digest: composed.planfile.canonical_plan_digest,
        intent: composed.intent_frame,
        selected_template: composed.selected_template?.template_id,
        validation: composed.validation_report,
        warnings: composed.warnings,
        ...(options.schedule && !options.yes ? { schedule_candidate: "Pass --yes with --schedule to create a schedule record." } : {}),
        ...(schedule ? { schedule } : {}),
      }, null, 2));
      return;
    }
    console.log(composed.markdown);
  });

const planBuilder = plan.command("builder").description("Collaboratively compose, check, revise, and save Planfiles.");

planBuilder.command("start")
  .argument("[prompt]", "Natural language goal")
  .option("--skills <path>", "Import a skills.md file")
  .option("--repo <path>", "Repository path for repository work")
  .option("--provider <provider>", "Preferred research search provider")
  .option("--schedule <cadence>", "Capture a schedule candidate: daily, weekly, or cron")
  .option("--at <time>", "Schedule time, for example 08:00")
  .action(async (prompt: string | undefined, options: { readonly skills?: string; readonly repo?: string; readonly provider?: string; readonly schedule?: string; readonly at?: string }) => {
    const currentProfile = await getCurrentProfile().catch(() => undefined);
    const session = await composeInitialPlan({
      ...(options.skills ? { skills_markdown: await readFile(cliPath(options.skills), "utf8"), prompt_source: "skills_file" } : { prompt: prompt ?? "" }),
      ...(currentProfile ? { runtime_profile: currentProfile } : {}),
      context: {
        ...(options.repo ? { repo_path: cliPath(options.repo) } : {}),
        ...(options.provider ? { provider_preference: options.provider } : {}),
        ...(options.schedule ? { schedule_preference: { cadence: scheduleCadence(options.schedule), ...(options.at ? { time_of_day: options.at } : {}) } } : {}),
      },
    });
    console.log(JSON.stringify(session, null, 2));
  });

planBuilder.command("list").action(() => {
  console.log(JSON.stringify({ sessions: listPlanBuilderSessions() }, null, 2));
});

planBuilder.command("status").argument("<sessionId>", "Plan Builder session ID").action((sessionId: string) => {
  const session = requireBuilderSession(sessionId);
  console.log(JSON.stringify(session, null, 2));
});

planBuilder.command("update")
  .argument("<sessionId>", "Plan Builder session ID")
  .requiredOption("--file <path>", "Edited Planfile Markdown or YAML path")
  .option("--allow-risk-increase", "Accept risk increases in the edited Planfile", false)
  .option("--allow-new-capabilities", "Accept newly referenced capabilities in the edited Planfile", false)
  .option("--allow-schedule-change", "Accept schedule changes in the edited Planfile", false)
  .action(async (sessionId: string, options: { readonly file: string; readonly allowRiskIncrease: boolean; readonly allowNewCapabilities: boolean; readonly allowScheduleChange: boolean }) => {
    const markdown = await readPlanfileEditMarkdown(options.file);
    const report = await updateBuilderPlanfileFromMarkdown({
      session_id: sessionId,
      markdown,
      update_source: "cli",
      options: {
        allow_risk_increase: options.allowRiskIncrease,
        allow_new_capabilities: options.allowNewCapabilities,
        allow_schedule_change: options.allowScheduleChange,
      },
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.parse_status !== "passed" || report.validation_status === "failed" || report.simulation_status === "invalid" || report.simulation_status === "unsafe") process.exitCode = 1;
  });

planBuilder.command("edit")
  .argument("<sessionId>", "Plan Builder session ID")
  .option("--allow-risk-increase", "Accept risk increases in the edited Planfile", false)
  .option("--allow-new-capabilities", "Accept newly referenced capabilities in the edited Planfile", false)
  .option("--allow-schedule-change", "Accept schedule changes in the edited Planfile", false)
  .action(async (sessionId: string, options: { readonly allowRiskIncrease: boolean; readonly allowNewCapabilities: boolean; readonly allowScheduleChange: boolean }) => {
    const session = requireBuilderSession(sessionId);
    if (!session.current_planfile) throw new Error(`Plan Builder session has no current Planfile: ${sessionId}`);
    const editPath = join(".open-lagrange", "plan-builder", sessionId, "editable.plan.md");
    await mkdir(dirname(editPath), { recursive: true });
    await writeFile(editPath, renderPlanfileMarkdown(session.current_planfile), "utf8");
    await runEditor(editPath);
    const report = await updateBuilderPlanfileFromMarkdown({
      session_id: sessionId,
      markdown: await readFile(editPath, "utf8"),
      update_source: "external_file",
      options: {
        allow_risk_increase: options.allowRiskIncrease,
        allow_new_capabilities: options.allowNewCapabilities,
        allow_schedule_change: options.allowScheduleChange,
      },
    });
    console.log(JSON.stringify({ edit_path: editPath, report }, null, 2));
    if (report.parse_status !== "passed" || report.validation_status === "failed" || report.simulation_status === "invalid" || report.simulation_status === "unsafe") process.exitCode = 1;
  });

planBuilder.command("import")
  .argument("<planfile>", "Planfile Markdown or YAML path")
  .action(async (path: string) => {
    console.log(JSON.stringify(importBuilderPlanfileFromMarkdown({
      markdown: await readPlanfileEditMarkdown(path),
      update_source: "cli",
      original_input: `Imported from ${path}`,
    }), null, 2));
  });

planBuilder.command("answer")
  .argument("<sessionId>", "Plan Builder session ID")
  .argument("<questionId>", "Question ID")
  .argument("<answer>", "Answer text")
  .action((sessionId: string, questionId: string, answer: string) => {
    console.log(JSON.stringify(answerQuestion(requireBuilderSession(sessionId), questionId, answer), null, 2));
  });

planBuilder.command("accept-defaults").argument("<sessionId>", "Plan Builder session ID").action(async (sessionId: string) => {
  const session = savePlanBuilderSession(await stabilizePlan(acceptDefaultAnswers(requireBuilderSession(sessionId), { persist: false }), { persist: false }));
  console.log(JSON.stringify(session, null, 2));
});

planBuilder.command("revise")
  .argument("<sessionId>", "Plan Builder session ID")
  .option("--prompt <prompt>", "Revision reason or updated intent")
  .option("--model-route <routeId>", "Planner model route ID")
  .action(async (sessionId: string, options: { readonly prompt?: string; readonly modelRoute?: string }) => {
    const route = options.modelRoute ? modelRouteById(options.modelRoute) : undefined;
    const revised = await revisePlan(requireBuilderSession(sessionId), { ...(options.prompt ? { reason: options.prompt } : {}), ...(route ? { route } : {}), persist: false });
    const session = await stabilizePlan(revised, { ...(route ? { route } : {}), persist: true });
    console.log(JSON.stringify(session, null, 2));
  });

planBuilder.command("validate").argument("<sessionId>", "Plan Builder session ID").action((sessionId: string) => {
  const session = validatePlan(simulatePlan(requireBuilderSession(sessionId), { persist: false }));
  console.log(JSON.stringify(session, null, 2));
});

planBuilder.command("save")
  .argument("<sessionId>", "Plan Builder session ID")
  .requiredOption("--output <path>", "Output Planfile Markdown path")
  .option("--library <library>", "Save to a named Plan Library")
  .option("--path <libraryPath>", "Path inside the selected Plan Library")
  .action((sessionId: string, options: { readonly output: string; readonly library?: string; readonly path?: string }) => {
    const session = requireBuilderSession(sessionId);
    const saved = saveReadyPlanfile(session, cliPath(options.output));
    const library = options.path ? saveBuilderSessionToLibrary({
      session_id: sessionId,
      path: options.path,
      ...(options.library ? { library: options.library } : {}),
    }) : undefined;
    console.log(JSON.stringify({ saved, ...(library ? { library } : {}) }, null, 2));
  });

planBuilder.command("run").argument("<sessionId>", "Plan Builder session ID").option("--live", "Execute through the local runtime path", false).action(async (sessionId: string, options: { readonly live: boolean }) => {
  const session = requireReadyBuilderSession(sessionId);
  const result = await checkAndCreateRunFromBuilderSession({ session_id: session.session_id, live: true });
  printRunCreationResult(result);
});

planBuilder.command("schedule")
  .argument("<sessionId>", "Plan Builder session ID")
  .option("--daily", "Run daily", false)
  .option("--weekly", "Run weekly", false)
  .option("--cron <expr>", "Record a cron cadence expression")
  .option("--at <time>", "Schedule time, for example 08:00")
  .option("--timezone <timezone>", "Schedule timezone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local")
  .action((sessionId: string, options: { readonly daily: boolean; readonly weekly: boolean; readonly cron?: string; readonly at?: string; readonly timezone?: string }) => {
    const session = requireReadyBuilderSession(sessionId);
    const path = join(".open-lagrange", "plans", `${session.current_planfile.plan_id}.plan.md`);
    saveReadyPlanfile(session, path);
    console.log(JSON.stringify(checkAndCreateScheduleRecord({
      planfile: session.current_planfile,
      planfile_path: path,
      cadence: scheduleCadence(options.cron ? "cron" : options.weekly ? "weekly" : "daily"),
      ...(options.at ? { time_of_day: options.at } : {}),
      ...(options.timezone ? { timezone: options.timezone } : {}),
    }), null, 2));
  });

plan.command("create")
  .requiredOption("--goal <goal>", "Goal to frame as a Planfile")
  .option("--dry-run", "Create a dry-run Planfile", true)
  .option("--out <path>", "Write Markdown Planfile to a path")
  .action(async (options: { readonly goal: string; readonly dryRun: boolean; readonly out?: string }) => {
    const goalFrame = await generateGoalFrame({ original_prompt: options.goal });
    const planfile = withCanonicalPlanDigest(await generatePlanfile({ goal_frame: goalFrame, mode: options.dryRun ? "dry_run" : "apply" }));
    const markdown = renderPlanfileMarkdown(planfile);
    if (options.out) {
      await writeFile(options.out, markdown, "utf8");
      console.log(JSON.stringify({ plan_id: planfile.plan_id, path: options.out, canonical_plan_digest: planfile.canonical_plan_digest }, null, 2));
      return;
    }
    console.log(markdown);
  });

plan.command("show").argument("<planfile>", "Planfile Markdown/YAML path or Plan Library reference").option("--library <library>", "Resolve the plan from a named Plan Library").action(async (path: string, options: { readonly library?: string }) => {
  const planfile = withCanonicalPlanDigest(await loadPlanfileOrLibraryRef(path, options.library));
  console.log(renderPlanfileMarkdown(planfile));
});

plan.command("validate").argument("<planfile>", "Planfile Markdown/YAML path or Plan Library reference").option("--library <library>", "Resolve the plan from a named Plan Library").action(async (path: string, options: { readonly library?: string }) => {
  const planfile = withCanonicalPlanDigest(await loadPlanfileOrLibraryRef(path, options.library));
  const result = validatePlanfile(planfile);
  console.log(JSON.stringify({ ...result, plan_id: planfile.plan_id, canonical_plan_digest: planfile.canonical_plan_digest }, null, 2));
  if (!result.ok) process.exitCode = 1;
});

plan.command("check").argument("<planfile>", "Planfile Markdown/YAML path or Plan Library reference").option("--library <library>", "Resolve the plan from a named Plan Library").action(async (path: string, options: { readonly library?: string }) => {
  const planfile = withCanonicalPlanDigest(await loadPlanfileOrLibraryRef(path, options.library));
  const runtimeProfile = await getCurrentProfile().catch(() => undefined);
  const report = runPlanCheck({ planfile, live: true, ...(runtimeProfile ? { runtime_profile: runtimeProfile } : {}) });
  console.log(JSON.stringify(report, null, 2));
  if (planCheckBlocksRun(report)) process.exitCode = 1;
});

plan.command("requirements").argument("<planfile>", "Planfile Markdown/YAML path or Plan Library reference").option("--library <library>", "Resolve the plan from a named Plan Library").action(async (path: string, options: { readonly library?: string }) => {
  const planfile = withCanonicalPlanDigest(await loadPlanfileOrLibraryRef(path, options.library));
  const runtimeProfile = await getCurrentProfile().catch(() => undefined);
  console.log(JSON.stringify(derivePlanRequirements({ planfile, ...(runtimeProfile ? { runtime_profile: runtimeProfile } : {}) }), null, 2));
});

plan.command("explain").argument("<planfile>", "Planfile Markdown/YAML path or Plan Library reference").option("--library <library>", "Resolve the plan from a named Plan Library").action(async (path: string, options: { readonly library?: string }) => {
  const planfile = withCanonicalPlanDigest(await loadPlanfileOrLibraryRef(path, options.library));
  const runtimeProfile = await getCurrentProfile().catch(() => undefined);
  const validation = validatePlanfile(planfile);
  const requirements = derivePlanRequirements({ planfile, ...(runtimeProfile ? { runtime_profile: runtimeProfile } : {}) });
  const plan_check_report = runPlanCheck({ planfile, live: true, ...(runtimeProfile ? { runtime_profile: runtimeProfile } : {}) });
  console.log(formatPlanExplanation({ planfile, validation, requirements, plan_check_report }));
});

const planLibrary = plan.command("library").description("Browse local Planfile libraries.");

planLibrary.command("list").description("List configured Plan Libraries.").action(() => {
  console.log(JSON.stringify({ libraries: listPlanLibraries() }, null, 2));
});

planLibrary.command("add")
  .argument("<name>", "Library name")
  .argument("<path>", "Local library directory")
  .option("--description <description>", "Display description")
  .action((name: string, path: string, options: { readonly description?: string }) => {
    console.log(JSON.stringify(addPlanLibrary({ name, path: cliPath(path), ...(options.description ? { description: options.description } : {}) }), null, 2));
  });

planLibrary.command("remove")
  .argument("<name>", "Library name")
  .action((name: string) => {
    console.log(JSON.stringify(removePlanLibrary({ name }), null, 2));
  });

planLibrary.command("show")
  .argument("<name>", "Library name")
  .action((name: string) => {
    console.log(JSON.stringify(showPlanLibrary({ name }), null, 2));
  });

planLibrary.command("plans")
  .argument("[name]", "Library name")
  .action((name: string | undefined) => {
    console.log(JSON.stringify({ plans: listPlanLibraryPlans({ ...(name ? { library: name } : {}) }) }, null, 2));
  });

planLibrary.command("read")
  .argument("<plan>", "Plan name, plan ID, or path")
  .option("--library <library>", "Library name")
  .action((planRef: string, options: { readonly library?: string }) => {
    console.log(showPlanFromLibrary({ plan: planRef, ...(options.library ? { library: options.library } : {}) }).content);
  });

planLibrary.command("delete-plan")
  .argument("<plan>", "Plan name, plan ID, or path")
  .option("--library <library>", "Library name")
  .action((planRef: string, options: { readonly library?: string }) => {
    console.log(JSON.stringify(removeSavedPlanFromLibrary({ plan: planRef, ...(options.library ? { library: options.library } : {}) }), null, 2));
  });

planLibrary.command("sync").description("Refresh local library listings.").action(() => {
  console.log(JSON.stringify(syncPlanLibrary(), null, 2));
});

plan.command("save")
  .argument("<planfile>", "Planfile Markdown or YAML path")
  .requiredOption("--path <libraryPath>", "Path inside the selected Plan Library")
  .option("--library <library>", "Library name", "workspace")
  .option("--tag <tag>", "Tag to record in the library manifest", collectString, [])
  .action((planfilePath: string, options: { readonly path: string; readonly library: string; readonly tag: readonly string[] }) => {
    console.log(JSON.stringify(savePlanToLibrary({
      planfile_path: cliPath(planfilePath),
      library: options.library,
      path: options.path,
      tags: options.tag,
    }), null, 2));
  });

plan.command("save-builder")
  .argument("<sessionId>", "Plan Builder session ID")
  .requiredOption("--path <libraryPath>", "Path inside the selected Plan Library")
  .option("--library <library>", "Library name", "workspace")
  .option("--tag <tag>", "Tag to record in the library manifest", collectString, [])
  .action((sessionId: string, options: { readonly path: string; readonly library: string; readonly tag: readonly string[] }) => {
    console.log(JSON.stringify(saveBuilderSessionToLibrary({
      session_id: sessionId,
      library: options.library,
      path: options.path,
      tags: options.tag,
    }), null, 2));
  });

plan.command("instantiate")
  .argument("<template>", "Template Planfile path")
  .option("--param <key=value>", "Template parameter", collectKeyValue, {})
  .option("--write <path>", "Write instantiated Planfile to a path")
  .action((template: string, options: { readonly param: Record<string, string>; readonly write?: string }) => {
    const result = instantiatePlanTemplate({
      template_path: cliPath(template),
      params: options.param,
      ...(options.write ? { write_path: cliPath(options.write) } : {}),
    });
    if (options.write) {
      console.log(JSON.stringify({ status: result.status, path: result.path }, null, 2));
      return;
    }
    console.log(result.content);
  });

plan.command("graph").argument("<planfile>", "Planfile Markdown or YAML path").action(async (path: string) => {
  console.log(renderPlanMermaid(await loadLocalPlanfile(path)));
});

plan.command("render").argument("<planfile>", "Planfile Markdown or YAML path").option("--out <path>", "Write regenerated Markdown to a path").action(async (path: string, options: { readonly out?: string }) => {
  const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
  const markdown = renderPlanfileMarkdown(planfile);
  if (options.out) {
    await writeFile(options.out, markdown, "utf8");
    console.log(JSON.stringify({ plan_id: planfile.plan_id, path: options.out, canonical_plan_digest: planfile.canonical_plan_digest }, null, 2));
    return;
  }
  console.log(markdown);
});

plan.command("diff")
  .argument("<oldPlanfile>", "Previous Planfile Markdown or YAML path")
  .argument("<newPlanfile>", "New Planfile Markdown or YAML path")
  .action(async (oldPlanfile: string, newPlanfile: string) => {
    const result = diffPlanfileMarkdown(await readPlanfileEditMarkdown(oldPlanfile), await readPlanfileEditMarkdown(newPlanfile));
    console.log(JSON.stringify(result, null, 2));
    if (result.diff_status === "changed") process.exitCode = 1;
  });

plan.command("reconcile")
  .argument("<planfile>", "Planfile Markdown or YAML path")
  .option("--render", "Print regenerated Markdown instead of the JSON report", false)
  .action(async (path: string, options: { readonly render: boolean }) => {
    const report = reconcilePlanfileMarkdown({ markdown: await readPlanfileEditMarkdown(path) });
    if (options.render && report.regenerated_markdown) {
      console.log(report.regenerated_markdown);
      return;
    }
    console.log(JSON.stringify(report, null, 2));
    if (report.parse_status !== "passed" || report.validation_status === "failed" || report.simulation_status === "invalid" || report.simulation_status === "unsafe") process.exitCode = 1;
  });

plan.command("run")
  .argument("<planfile>", "Planfile Markdown/YAML path or Plan Library reference")
  .option("--library <library>", "Resolve the plan from a named Plan Library")
  .action(async (path: string, options: { readonly library?: string }) => {
    const planfile = withCanonicalPlanDigest(await loadPlanfileOrLibraryRef(path, options.library));
    const result = await checkAndCreateRunFromPlanfile({ planfile, live: true });
    printRunCreationResult(result);
  });

plan.command("apply")
  .argument("<planfile>", "Planfile Markdown/YAML path or Plan Library reference")
  .option("--library <library>", "Resolve the plan from a named Plan Library")
  .action(async (path: string, options: { readonly library?: string }) => {
    const planfile = withCanonicalPlanDigest(await loadPlanfileOrLibraryRef(path, options.library));
    const result = await checkAndCreateRunFromPlanfile({ planfile, live: true });
    printRunCreationResult(result);
  });

plan.command("resume").argument("<planId>", "Plan ID").action(async (planId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).resumePlan(planId), null, 2));
});

plan.command("status").argument("<planId>", "Plan ID").action(async (planId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getPlanStatus(planId), null, 2));
});

const schedule = program.command("schedule").description("Create and run explicit schedule records.");

schedule.command("create")
  .argument("<planfile>", "Planfile Markdown or YAML path")
  .option("--daily", "Run daily", false)
  .option("--weekly", "Run weekly", false)
  .option("--cron <expr>", "Record a cron cadence expression")
  .option("--at <time>", "Schedule time, for example 08:00")
  .option("--timezone <timezone>", "Schedule timezone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local")
  .action(async (path: string, options: { readonly daily: boolean; readonly weekly: boolean; readonly cron?: string; readonly at?: string; readonly timezone?: string }) => {
    const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
    const currentProfile = await getCurrentProfile().catch(() => undefined);
    const record = checkAndCreateScheduleRecord({
      planfile,
      planfile_path: path,
      cadence: scheduleCadence(options.cron ? "cron" : options.weekly ? "weekly" : "daily"),
      ...(options.at ? { time_of_day: options.at } : {}),
      ...(options.timezone ? { timezone: options.timezone } : {}),
      runtime_profile: currentProfile?.name ?? "local",
    });
    console.log(JSON.stringify(record, null, 2));
    if (record.status === "blocked") process.exitCode = 1;
  });

schedule.command("list").action(() => {
  console.log(JSON.stringify({ schedules: listScheduleRecords() }, null, 2));
});

schedule.command("run")
  .argument("<scheduleId>", "Schedule ID")
  .action(async (scheduleId: string) => {
    const record = getScheduleRecord(scheduleId);
    if (!record) {
      console.log(JSON.stringify({ status: "missing", schedule_id: scheduleId }, null, 2));
      process.exitCode = 1;
      return;
    }
    const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(record.planfile_path));
    const result = await checkAndCreateRunFromPlanfile({ planfile, live: true });
    if (result.status === "blocked") {
      console.log(JSON.stringify({ schedule_id: scheduleId, ...result }, null, 2));
      process.exitCode = 1;
      return;
    }
    printRunCreationResult(result);
  });

plan.command("approve").argument("<planId>", "Plan ID").requiredOption("--reason <reason>", "Approval reason").requiredOption("--approval-token <approvalToken>", "Approval token").option("--approved-by <approvedBy>", "Approver identifier", "human-local").action(async (planId: string, options: { readonly reason: string; readonly approvalToken: string; readonly approvedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).approvePlan(planId, { decided_by: options.approvedBy, reason: options.reason, approval_token: options.approvalToken }), null, 2));
});

plan.command("reject").argument("<planId>", "Plan ID").requiredOption("--reason <reason>", "Rejection reason").requiredOption("--approval-token <approvalToken>", "Approval token").option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local").action(async (planId: string, options: { readonly reason: string; readonly approvalToken: string; readonly rejectedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).rejectPlan(planId, { decided_by: options.rejectedBy, reason: options.reason, approval_token: options.approvalToken }), null, 2));
});

const skill = program.command("skill").description("Skill shortcuts that compile into Planfile or pack artifacts.");

skill.command("frame")
  .argument("<skillfile>", "skills.md path")
  .action(async (path: string) => {
    const parsed = parseSkillfileMarkdown(await readFile(path, "utf8"));
    console.log(JSON.stringify(await generateSkillFrame({ skillfile: parsed }), null, 2));
  });

skill.command("plan")
  .description("Compile a skill file into a Planfile-backed artifact.")
  .argument("<skillfile>", "skills.md path")
  .option("--output <path>", "Write markdown artifact to a path")
  .option("--write", "Write to .open-lagrange/skills/<skill_id>.skill.md", false)
  .action(async (path: string, options: { readonly output?: string; readonly write: boolean }) => {
    const parsed = parseSkillfileMarkdown(await readFile(path, "utf8"));
    const frame = await generateSkillFrame({ skillfile: parsed });
    const result = generateWorkflowSkill({ frame });
    const outputPath = options.output ?? (options.write ? `.open-lagrange/skills/${frame.skill_id}.skill.md` : undefined);
    if (outputPath) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, result.markdown, "utf8");
      console.log(JSON.stringify({ skill_id: frame.skill_id, path: outputPath, decision: result.decision.decision }, null, 2));
      return;
    }
    console.log(result.markdown);
  });

skill.command("validate")
  .argument("<workflowSkill>", "Workflow Skill markdown or YAML path")
  .action(async (path: string) => {
    const workflowSkill = parseWorkflowSkillMarkdown(await readFile(path, "utf8"));
    const result = validateWorkflowSkill(workflowSkill);
    console.log(JSON.stringify({ skill_id: workflowSkill.skill_id, ...result }, null, 2));
    if (!result.ok) process.exitCode = 1;
  });

skill.command("run")
  .argument("<workflowSkill>", "Workflow Skill markdown or YAML path")
  .option("--dry-run", "Validate and preview without dispatching capabilities", true)
  .action(async (path: string, options: { readonly dryRun: boolean }) => {
    if (!options.dryRun) throw new Error("Phase 1 supports --dry-run only.");
    const workflowSkill = parseWorkflowSkillMarkdown(await readFile(path, "utf8"));
    console.log(JSON.stringify(previewWorkflowSkillRun({ workflow_skill: workflowSkill }), null, 2));
  });

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function requireSecretInput(value: string, message: string): string {
  if (value.trim().length === 0) throw new CliUsageError(message);
  return value;
}

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CliUsageError) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function runtimeOption(value: string | undefined): "docker" | "podman" | undefined {
  if (value === "docker" || value === "podman") return value;
  if (!value) return undefined;
  throw new Error("--runtime must be docker or podman");
}

async function loadLocalPlanfile(path: string) {
  const text = await readFile(path, "utf8");
  return path.endsWith(".yaml") || path.endsWith(".yml") ? parsePlanfileYaml(text) : parsePlanfileMarkdown(text);
}

async function loadPlanfileOrLibraryRef(pathOrRef: string, library: string | undefined) {
  const local = cliPath(pathOrRef);
  if (existsSync(local)) return loadLocalPlanfile(local);
  const entry = resolvePlanLibraryEntry({ plan: pathOrRef, ...(library ? { library } : {}) });
  return loadLocalPlanfile(entry.path);
}

async function readPlanfileEditMarkdown(path: string): Promise<string> {
  const local = cliPath(path);
  const text = await readFile(local, "utf8");
  if (local.endsWith(".yaml") || local.endsWith(".yml")) return renderPlanfileMarkdown(withCanonicalPlanDigest(parsePlanfileYaml(text)));
  return text;
}

async function runEditor(path: string): Promise<void> {
  const [command, ...editorArgs] = parseEditorCommand(process.env.EDITOR);
  if (!command) throw new Error("No editor command configured.");
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...editorArgs, path], { stdio: "inherit", shell: false });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Editor exited with code ${code ?? "unknown"}.`));
    });
  });
}

function secretProvider(value: string): SecretRef["provider"] {
  if (value === "os-keychain" || value === "env" || value === "vault" || value === "external") return value;
  throw new Error("--provider must be os-keychain, env, vault, or external");
}

function artifactRole(value: string): "primary_output" | "supporting_evidence" | "debug_log" | "intermediate" | "superseded" {
  if (value === "primary_output" || value === "supporting_evidence" || value === "debug_log" || value === "intermediate" || value === "superseded") return value;
  throw new Error("--role must be primary_output, supporting_evidence, debug_log, intermediate, or superseded");
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("Expected a positive integer.");
  return parsed;
}

function collectString(value: string, previous: readonly string[]): string[] {
  return [...previous, value];
}

function collectKeyValue(value: string, previous: Record<string, string>): Record<string, string> {
  const index = value.indexOf("=");
  if (index <= 0) throw new Error("--param must use key=value");
  return { ...previous, [value.slice(0, index)]: value.slice(index + 1) };
}

function hasMissingRequirements(report: ReturnType<typeof derivePlanRequirements>): boolean {
  return report.missing_packs.length > 0
    || report.missing_providers.length > 0
    || report.missing_credentials.length > 0
    || report.missing_permissions.length > 0;
}

function formatPlanExplanation(input: {
  readonly planfile: Awaited<ReturnType<typeof loadLocalPlanfile>>;
  readonly validation: ReturnType<typeof validatePlanfile>;
  readonly requirements: ReturnType<typeof derivePlanRequirements>;
  readonly plan_check_report?: ReturnType<typeof runPlanCheck>;
}): string {
  const scheduleInfo = input.requirements.schedule_info
    ? JSON.stringify(input.requirements.schedule_info)
    : "none";
  return [
    `Planfile: ${input.planfile.plan_id}`,
    `Goal: ${input.planfile.goal_frame.interpreted_goal}`,
    `Status: ${input.planfile.status}`,
    `Mode: ${input.planfile.mode}`,
    `Validation: ${input.validation.ok ? "passed" : "failed"}`,
    ...(input.plan_check_report ? [`Plan Check: ${input.plan_check_report.status}`] : []),
    `Portability: ${input.requirements.portability_level}`,
    "",
    "Requirements:",
    `- Packs: ${lineList(input.requirements.required_packs)}`,
    `- Providers: ${lineList(input.requirements.required_providers)}`,
    `- Credentials: ${lineList(input.requirements.required_credentials)}`,
    `- Permissions: ${lineList(input.requirements.permissions)}`,
    `- Approvals: ${lineList(input.requirements.approval_requirements)}`,
    `- Side effects: ${lineList(input.requirements.side_effects)}`,
    `- Schedule: ${scheduleInfo}`,
    "",
    "Missing:",
    `- Packs: ${lineList(input.requirements.missing_packs)}`,
    `- Providers: ${lineList(input.requirements.missing_providers)}`,
    `- Credentials: ${lineList(input.requirements.missing_credentials)}`,
    `- Permissions: ${lineList(input.requirements.missing_permissions)}`,
    ...(input.requirements.suggested_commands.length > 0 ? ["", "Suggested Commands:", ...input.requirements.suggested_commands.map((command) => `- ${command}`)] : []),
    ...(input.plan_check_report && input.plan_check_report.suggested_actions.length > 0
      ? ["", "Next Actions:", ...input.plan_check_report.suggested_actions.map((action) => `- ${action.label}${action.command ? `: ${action.command}` : ""}`)]
      : []),
  ].join("\n");
}

function lineList(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function printRunCreationResult(result: Awaited<ReturnType<typeof checkAndCreateRunFromPlanfile>>): void {
  if (result.status === "blocked") {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log([
    `Run created: ${result.run_id}`,
    "View live:",
    `  open-lagrange run watch ${result.run_id}`,
    "Inspect:",
    `  open-lagrange run status ${result.run_id}`,
    "",
    JSON.stringify({
      run_id: result.run_id,
      status: result.snapshot.status,
      plan_id: result.snapshot.plan_id,
      artifacts: result.snapshot.artifacts.map((artifact) => artifact.artifact_id),
      next_actions: result.snapshot.next_actions,
      plan_check_report: {
        status: result.plan_check_report.status,
        portability: result.plan_check_report.portability,
        warnings: result.plan_check_report.warnings,
      },
    }, null, 2),
  ].join("\n"));
}

function requireBuilderSession(sessionId: string) {
  const session = getPlanBuilderSession(sessionId);
  if (!session) throw new Error(`Plan Builder session not found: ${sessionId}`);
  return session;
}

function requireReadyBuilderSession(sessionId: string) {
  const session = requireBuilderSession(sessionId);
  if ((session.status !== "ready" && session.status !== "approved") || !session.current_planfile) {
    throw new Error(`Plan Builder session is not ready: ${sessionId}`);
  }
  return { ...session, current_planfile: session.current_planfile };
}

function modelRouteById(routeId: string) {
  const route = listModelRouteConfigs().find((item) => item.route_id === routeId);
  if (!route) throw new Error(`Unknown model route: ${routeId}`);
  return route;
}

function scheduleCadence(value: string): "daily" | "weekly" | "cron" {
  if (value === "daily" || value === "weekly" || value === "cron") return value;
  throw new Error("Schedule cadence must be daily, weekly, or cron.");
}

async function currentSearchProviderConfigs(): Promise<readonly SearchProviderConfig[]> {
  const profile = await getCurrentProfile().catch(() => undefined);
  return profile?.searchProviders ?? [];
}

async function probeSearchProvider(baseUrl: string): Promise<"running" | "unreachable"> {
  try {
    const url = new URL("/search", baseUrl);
    url.searchParams.set("q", "open lagrange");
    url.searchParams.set("format", "json");
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(1500) });
    return response.ok ? "running" : "unreachable";
  } catch {
    return "unreachable";
  }
}

function planningModeOption(value: string): "deterministic" | "model" | "model_with_deterministic_fallback" {
  if (value === "deterministic" || value === "model") return value;
  if (value === "model-with-fallback" || value === "model_with_deterministic_fallback") return "model_with_deterministic_fallback";
  throw new Error("--planning-mode must be deterministic, model, or model-with-fallback");
}

function modelRouteForPlanning(value: string) {
  const mode = planningModeOption(value);
  if (mode === "deterministic") return {};
  const route = listModelRouteConfigs().find((item) => item.route_id === "strong-plan-small-implement") ?? listModelRouteConfigs()[0];
  return route ? { model_route: route } : {};
}

function isMissingStatus(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "status" in value && (value as { readonly status?: unknown }).status === "missing");
}

function isPatchArtifact(value: unknown): value is { readonly plan_id: string; readonly unified_diff: string; readonly changed_files: readonly string[] } {
  return Boolean(value && typeof value === "object"
    && typeof (value as { readonly plan_id?: unknown }).plan_id === "string"
    && typeof (value as { readonly unified_diff?: unknown }).unified_diff === "string"
    && Array.isArray((value as { readonly changed_files?: unknown }).changed_files));
}

async function currentSecretRefNames(): Promise<string[]> {
  const profile = await getCurrentProfile().catch(() => undefined);
  if (!profile?.secretRefs) return [];
  return Object.entries(profile.secretRefs).flatMap(([key, ref]) => [key, ref.ref_id, ref.name].filter(Boolean));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function promptSecretValue(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return readStdin();
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk: string) => {
      if (chunk === "\u0003") {
        cleanup();
        reject(new Error("Secret input cancelled."));
        return;
      }
      if (chunk === "\r" || chunk === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (chunk === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += chunk;
    };
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    process.stdin.on("data", onData);
  });
}

function findScriptRoot(scriptName: string): string {
  for (const start of [process.env.INIT_CWD, process.cwd(), dirname(fileURLToPath(import.meta.url))].filter((item): item is string => Boolean(item))) {
    const found = findUp(start, (dir) => packageHasScript(dir, scriptName));
    if (found) return found;
  }
  return process.cwd();
}

function findUp(start: string, predicate: (dir: string) => boolean): string | undefined {
  let dir = start;
  while (true) {
    if (predicate(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function packageHasScript(dir: string, scriptName: string): boolean {
  const packagePath = join(dir, "package.json");
  if (!existsSync(packagePath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { readonly scripts?: Record<string, unknown> };
    return typeof parsed.scripts?.[scriptName] === "string";
  } catch {
    return false;
  }
}

interface RunEventWatchEnvelope {
  readonly event_id: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly event: { readonly type: string };
}

function terminalRunEvent(type: string): boolean {
  return type === "run.completed" || type === "run.failed" || type === "run.yielded" || type === "run.cancelled";
}

function cliPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function packTarget(value: string): string {
  const resolved = cliPath(value);
  return existsSync(resolved) ? resolved : value;
}
