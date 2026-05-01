#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Command } from "commander";
import { approvalTokenForRequest } from "@open-lagrange/core/approval";
import { exportArtifact, listArtifacts, listRunArtifacts, listRuns, recentArtifacts, reindexArtifacts, showArtifact, showRun } from "@open-lagrange/core/artifacts";
import { listDemos, openDemo, runDemo } from "@open-lagrange/core/demos";
import { runCoreDoctor } from "@open-lagrange/core/doctor";
import { getPackHealth, inspectPack, listInspectablePacks, runPackSmoke, validateRegisteredPack } from "@open-lagrange/core/packs";
import { applyPlanfile as applyLocalPlanfile, generateGoalFrame, generatePlanfile, parsePlanfileMarkdown, parsePlanfileYaml, renderPlanfileMarkdown, renderPlanMermaid, validatePlanfile, withCanonicalPlanDigest } from "@open-lagrange/core/planning";
import { applyRepositoryPlanfile as applyLocalRepositoryPlanfile, approveApprovalRequest, approveRepositoryScopeRequest, cleanupRepositoryPlan as cleanupLocalRepositoryPlan, createRepositoryPlanfile, exportRepositoryPlanPatch as exportLocalRepositoryPlanPatch, getRepositoryPlanStatus as getLocalRepositoryPlanStatus, rejectApprovalRequest, rejectRepositoryScopeRequest, resumeRepositoryPlan } from "@open-lagrange/core/repository";
import { compareBenchmarkRun, listBenchmarkScenarios, listModelRouteConfigs, renderBenchmarkReport, runModelRoutingBenchmark } from "@open-lagrange/core/evals";
import { runResearchBriefCommand, runResearchExportCommand, runResearchFetchCommand, runResearchSearchCommand } from "@open-lagrange/core/research";
import { buildGeneratedPackFromMarkdown, generateSkillFrame, generateWorkflowSkill, installGeneratedPack, parseSkillfileMarkdown, parseWorkflowSkillMarkdown, previewWorkflowSkillRun, scaffoldGeneratedPack, validateGeneratedPack, validateWorkflowSkill } from "@open-lagrange/core/skills";
import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import { addLocalProfile, addRemoteProfile, bootstrapLocalRuntime, configureCurrentProfileModelProvider, deleteCurrentProfileSecret, describeCurrentProfileModelProvider, describeCurrentProfileSecret, getCurrentProfile, getProfilePackPaths, initRuntime, listCurrentProfileModelProviders, listCurrentProfileSecrets, listKnownModelProviders, loadConfig, removeProfile, restartLocalRuntime, setCurrentProfile, setCurrentProfileSecret, startLocalRuntime, stopLocalRuntime, tailLogs, getRuntimeStatus } from "@open-lagrange/runtime-manager";
import type { SecretRef } from "@open-lagrange/core/secrets";

const program = new Command();

program
  .name("open-lagrange")
  .description("Open Lagrange Control Plane CLI.");

program
  .command("init")
  .description("Create a local Open Lagrange runtime profile.")
  .option("--runtime <runtime>", "docker or podman")
  .action(async (options: { readonly runtime?: string }) => {
    const runtime = runtimeOption(options.runtime);
    console.log(JSON.stringify(await initRuntime({ ...(runtime ? { runtime } : {}) }), null, 2));
  });

program
  .command("bootstrap")
  .description("Initialize and start the local runtime in one step.")
  .option("--runtime <runtime>", "docker or podman")
  .option("--dev", "Run API and worker as local Node processes", false)
  .option("--force-init", "Regenerate the managed local profile and compose file", false)
  .action(async (options: { readonly runtime?: string; readonly dev: boolean; readonly forceInit: boolean }) => {
    const runtime = runtimeOption(options.runtime);
    console.log(JSON.stringify(await bootstrapLocalRuntime({ ...(runtime ? { runtime } : {}), dev: options.dev, forceInit: options.forceInit }), null, 2));
  });

program
  .command("up")
  .description("Start the local runtime for the current profile.")
  .option("--runtime <runtime>", "docker or podman")
  .option("--dev", "Run API and worker as local Node processes", false)
  .action(async (options: { readonly runtime?: string; readonly dev: boolean }) => {
    const runtime = runtimeOption(options.runtime);
    console.log(JSON.stringify(await startLocalRuntime({ ...(runtime ? { runtime } : {}), dev: options.dev }), null, 2));
  });

program.command("down").description("Stop the local runtime.").action(async () => {
  console.log(JSON.stringify(await stopLocalRuntime(), null, 2));
});

program.command("restart").description("Restart the local runtime.").option("--dev", "Run API and worker as local Node processes", false).action(async (options: { readonly dev: boolean }) => {
  console.log(JSON.stringify(await restartLocalRuntime({ dev: options.dev }), null, 2));
});

program
  .command("status")
  .description("Show runtime status, or project status when an ID is provided.")
  .argument("[projectOrRunId]", "Project ID or run ID")
  .action(async (projectOrRunId: string | undefined) => {
    if (projectOrRunId) console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getProjectStatus(projectOrRunId), null, 2));
    else console.log(JSON.stringify(await getRuntimeStatus(), null, 2));
  });

program.command("doctor").description("Run local or remote profile checks.").action(async () => {
  console.log(JSON.stringify(await runCoreDoctor(), null, 2));
});

program.command("logs").description("Show local runtime logs.").argument("[service]", "api, worker, web, hatchet, or compose service").action(async (service: string | undefined) => {
  console.log(await tailLogs(service));
});

program.command("tui").description("Start the terminal reconciliation cockpit.").allowUnknownOption(true).allowExcessArguments(true).action(async () => {
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

const demo = program.command("demo").description("Run golden-path demos.");

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

const artifact = program.command("artifact").description("Inspect local artifact index entries.");

artifact.command("list")
  .option("--run <runId>", "Show artifacts for a run ID, or latest")
  .option("--role <role>", "Filter run artifacts by role: primary_output, supporting_evidence, debug_log")
  .option("--limit <count>", "Limit flat artifact results", parsePositiveInt, 50)
  .action((options: { readonly run?: string; readonly role?: string; readonly limit: number }) => {
    if (options.run) {
      console.log(JSON.stringify(listRunArtifacts({ run_id: options.run, ...(options.role ? { role: artifactRole(options.role) } : {}) }), null, 2));
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

artifact.command("export").argument("<artifactId>", "Artifact ID").requiredOption("--output <path>", "Output path").action((artifactId: string, options: { readonly output: string }) => {
  console.log(JSON.stringify(exportArtifact({ artifact_id: artifactId, output_path: options.output }), null, 2));
});

artifact.command("reindex").action(() => {
  console.log(JSON.stringify(reindexArtifacts(), null, 2));
});

const run = program.command("run").description("Inspect run-centered outputs.");

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

profile.command("add-local").argument("<name>", "Profile name").requiredOption("--runtime <runtime>", "docker or podman").description("Add a local profile.").action(async (name: string, options: { readonly runtime: string }) => {
  console.log(JSON.stringify(await addLocalProfile(name, runtimeOption(options.runtime) ?? "podman"), null, 2));
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
    const value = options.fromStdin ? await readStdin() : await promptSecretValue(`Secret value for ${name}: `);
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
  const value = options.fromStdin ? await readStdin() : await promptSecretValue("Open Lagrange token: ");
  console.log(JSON.stringify(await setCurrentProfileSecret({ name: "open_lagrange_token", value, provider: "os-keychain" }), null, 2));
});

auth.command("logout").action(async () => {
  console.log(JSON.stringify(await deleteCurrentProfileSecret("open_lagrange_token"), null, 2));
});

auth.command("status").action(async () => {
  try {
    console.log(JSON.stringify(await describeCurrentProfileSecret("open_lagrange_token"), null, 2));
  } catch {
    console.log(JSON.stringify({ status: "missing_profile", message: "Run open-lagrange init before configuring auth." }, null, 2));
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

const repo = program.command("repo").description("Run repository-scoped workflows.");

repo.command("run")
  .requiredOption("--repo <path>", "Repository root")
  .requiredOption("--goal <goal>", "Repository task goal")
  .option("--workspace-id <workspaceId>", "Repository workspace ID")
  .option("--dry-run", "Plan and require approval before writes", true)
  .option("--apply", "Apply the approved patch immediately", false)
  .option("--require-approval", "Require approval before applying", false)
  .option("--planning-mode <mode>", "deterministic, model, or model-with-fallback", "deterministic")
  .option("--legacy", "Use the original repository task endpoint", false)
  .action(async (options: { readonly repo: string; readonly goal: string; readonly workspaceId?: string; readonly dryRun: boolean; readonly apply: boolean; readonly requireApproval: boolean; readonly planningMode: string; readonly legacy: boolean }) => {
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
        console.log(JSON.stringify({ plan_id: created.planfile.plan_id, path: created.path, canonical_plan_digest: created.planfile.canonical_plan_digest }, null, 2));
        return;
      }
      console.log(JSON.stringify(await applyLocalRepositoryPlanfile({
        planfile: created.planfile,
        allow_dirty_base: false,
        retain_on_failure: true,
      }), null, 2));
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
  .action(async (path: string, options: { readonly retainWorktree: boolean; readonly allowDirtyBase: boolean; readonly cleanupOnSuccess: boolean }) => {
    const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
    console.log(JSON.stringify(await applyLocalRepositoryPlanfile({
      planfile,
      allow_dirty_base: options.allowDirtyBase,
      retain_on_failure: options.retainWorktree || !options.cleanupOnSuccess,
    }), null, 2));
  });

repo.command("status").argument("<planId>", "Plan ID, task ID, or task run ID").action(async (planId: string) => {
  const client = await createPlatformClientFromCurrentProfile().catch(() => undefined);
  const status = await getLocalRepositoryPlanStatus(planId) ?? await client?.getRepositoryPlanStatus(planId);
  if (isMissingStatus(status) && client) console.log(JSON.stringify(await client.getTaskStatus(planId), null, 2));
  else console.log(JSON.stringify(status, null, 2));
});

repo.command("resume").argument("<planId>", "Repository plan ID").action(async (planId: string) => {
  console.log(JSON.stringify(await resumeRepositoryPlan({ plan_id: planId }), null, 2));
});

repo.command("diff").argument("<taskId>", "Task ID or task run ID").action(async (taskId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getArtifact("diff", { task_id: taskId, type: "diff" }), null, 2));
});

repo.command("patch")
  .argument("<planId>", "Repository plan ID")
  .option("--output <path>", "Write final patch to a file")
  .action(async (planId: string, options: { readonly output?: string }) => {
    const patch = await exportLocalRepositoryPlanPatch(planId, options.output);
    if (options.output && isPatchArtifact(patch)) {
      console.log(JSON.stringify({ plan_id: patch.plan_id, output: options.output, changed_files: patch.changed_files }, null, 2));
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

repo.command("cleanup").argument("<planId>", "Repository plan ID").action(async (planId: string) => {
  console.log(JSON.stringify(await cleanupLocalRepositoryPlan(planId), null, 2));
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

const evalCommand = program.command("eval").description("Run repository evaluation harnesses.");

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

const research = program.command("research").description("Run fixture-backed and bounded live research workflows.");

research.command("search")
  .argument("<query>", "Research query")
  .option("--fixture", "Use deterministic checked-in fixture sources", true)
  .option("--live", "Request live search provider if configured", false)
  .option("--output-dir <path>", "Artifact output directory")
  .action(async (query: string, options: { readonly fixture: boolean; readonly live: boolean; readonly outputDir?: string }) => {
    console.log(JSON.stringify(await runResearchSearchCommand({
      query,
      mode: options.live ? "live" : "fixture",
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    }), null, 2));
  });

research.command("fetch")
  .argument("<url>", "Source URL")
  .option("--live", "Allow explicit live URL fetch through network policy", false)
  .option("--fixture", "Resolve URL against deterministic fixture sources", true)
  .option("--output-dir <path>", "Artifact output directory")
  .action(async (url: string, options: { readonly live: boolean; readonly fixture: boolean; readonly outputDir?: string }) => {
    if (!options.live) {
      console.log(JSON.stringify({ status: "requires_live", message: "Live URL fetch requires --live. Fixture mode can resolve checked-in fixture URLs only." }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(await runResearchFetchCommand({
      url,
      mode: "live",
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    }), null, 2));
  });

research.command("brief")
  .argument("<topic>", "Brief topic")
  .option("--fixture", "Use deterministic checked-in fixture sources", true)
  .option("--live", "Reserved for future live search provider use", false)
  .option("--output-dir <path>", "Artifact output directory")
  .action(async (topic: string, options: { readonly fixture: boolean; readonly live: boolean; readonly outputDir?: string }) => {
    console.log(JSON.stringify(await runResearchBriefCommand({
      topic,
      mode: options.live ? "live" : "fixture",
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    }), null, 2));
  });

research.command("export")
  .argument("<briefId>", "Research brief artifact ID")
  .option("--output-dir <path>", "Artifact output directory")
  .action(async (briefId: string, options: { readonly outputDir?: string }) => {
    console.log(JSON.stringify(await runResearchExportCommand({
      brief_id: briefId,
      ...(options.outputDir ? { output_dir: cliPath(options.outputDir) } : {}),
    }), null, 2));
  });

const plan = program.command("plan").description("Author and execute Planfiles.");

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

plan.command("show").argument("<planfile>", "Planfile Markdown or YAML path").action(async (path: string) => {
  const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
  console.log(renderPlanfileMarkdown(planfile));
});

plan.command("validate").argument("<planfile>", "Planfile Markdown or YAML path").action(async (path: string) => {
  const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
  const result = validatePlanfile(planfile);
  console.log(JSON.stringify({ ...result, plan_id: planfile.plan_id, canonical_plan_digest: planfile.canonical_plan_digest }, null, 2));
  if (!result.ok) process.exitCode = 1;
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

plan.command("apply").argument("<planfile>", "Planfile Markdown or YAML path").option("--live", "Execute through the local runtime path", false).action(async (path: string, options: { readonly live: boolean }) => {
  const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
  const validation = validatePlanfile(planfile);
  if (!validation.ok) {
    console.log(JSON.stringify({ ...validation, plan_id: planfile.plan_id }, null, 2));
    process.exitCode = 1;
    return;
  }
  if (options.live) {
    console.log(JSON.stringify(await applyLocalPlanfile({ planfile, live: true }), null, 2));
    return;
  }
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).applyPlanfile({ planfile }), null, 2));
});

plan.command("resume").argument("<planId>", "Plan ID").action(async (planId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).resumePlan(planId), null, 2));
});

plan.command("status").argument("<planId>", "Plan ID").action(async (planId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getPlanStatus(planId), null, 2));
});

plan.command("approve").argument("<planId>", "Plan ID").requiredOption("--reason <reason>", "Approval reason").requiredOption("--approval-token <approvalToken>", "Approval token").option("--approved-by <approvedBy>", "Approver identifier", "human-local").action(async (planId: string, options: { readonly reason: string; readonly approvalToken: string; readonly approvedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).approvePlan(planId, { decided_by: options.approvedBy, reason: options.reason, approval_token: options.approvalToken }), null, 2));
});

plan.command("reject").argument("<planId>", "Plan ID").requiredOption("--reason <reason>", "Rejection reason").requiredOption("--approval-token <approvalToken>", "Approval token").option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local").action(async (planId: string, options: { readonly reason: string; readonly approvalToken: string; readonly rejectedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).rejectPlan(planId, { decided_by: options.rejectedBy, reason: options.reason, approval_token: options.approvalToken }), null, 2));
});

const skill = program.command("skill").description("Build and preview Workflow Skill artifacts.");

skill.command("frame")
  .argument("<skillfile>", "skills.md path")
  .action(async (path: string) => {
    const parsed = parseSkillfileMarkdown(await readFile(path, "utf8"));
    console.log(JSON.stringify(await generateSkillFrame({ skillfile: parsed }), null, 2));
  });

skill.command("plan")
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

await program.parseAsync(process.argv);

function runtimeOption(value: string | undefined): "docker" | "podman" | undefined {
  if (value === "docker" || value === "podman") return value;
  if (!value) return undefined;
  throw new Error("--runtime must be docker or podman");
}

async function loadLocalPlanfile(path: string) {
  const text = await readFile(path, "utf8");
  return path.endsWith(".yaml") || path.endsWith(".yml") ? parsePlanfileYaml(text) : parsePlanfileMarkdown(text);
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
  for (const start of [process.env.INIT_CWD, process.cwd()].filter((item): item is string => Boolean(item))) {
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

function cliPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function packTarget(value: string): string {
  const resolved = cliPath(value);
  return existsSync(resolved) ? resolved : value;
}
