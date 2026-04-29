#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { Command } from "commander";
import { generateGoalFrame, generatePlanfile, parsePlanfileMarkdown, parsePlanfileYaml, renderPlanfileMarkdown, renderPlanMermaid, validatePlanfile, withCanonicalPlanDigest } from "@open-lagrange/core/planning";
import { createRepositoryPlanfile } from "@open-lagrange/core/repository";
import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import { addLocalProfile, addRemoteProfile, deleteCurrentProfileSecret, describeCurrentProfileSecret, getCurrentProfile, initRuntime, listCurrentProfileSecrets, loadConfig, removeProfile, restartLocalRuntime, runDoctor, setCurrentProfile, setCurrentProfileSecret, startLocalRuntime, stopLocalRuntime, tailLogs, getRuntimeStatus } from "@open-lagrange/runtime-manager";
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
  console.log(JSON.stringify(await runDoctor(), null, 2));
});

program.command("logs").description("Show local runtime logs.").argument("[service]", "api, worker, web, hatchet, or compose service").action(async (service: string | undefined) => {
  console.log(await tailLogs(service));
});

program.command("tui").description("Start the terminal reconciliation cockpit.").allowUnknownOption(true).action(async () => {
  const args = process.argv.slice(process.argv.indexOf("tui") + 1);
  const child = spawn("npm", ["run", "dev:tui", "--", ...args], { cwd: process.cwd(), stdio: "inherit" });
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
  .option("--approved-by <approvedBy>", "Approver identifier", "human-local")
  .action(async (taskId: string, options: { readonly reason: string; readonly approvedBy: string }) => {
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).approveTask(taskId, { decided_by: options.approvedBy, reason: options.reason }), null, 2));
  });

program
  .command("reject")
  .description("Reject a task.")
  .argument("<taskId>", "Task ID or task run ID")
  .requiredOption("--reason <reason>", "Rejection reason")
  .option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local")
  .action(async (taskId: string, options: { readonly reason: string; readonly rejectedBy: string }) => {
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).rejectTask(taskId, { decided_by: options.rejectedBy, reason: options.reason }), null, 2));
  });

program.command("run-demo").description("Submit the README summary demo.").action(async () => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).submitProject({ goal: "Create a short README summary for this repository." }), null, 2));
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

const repo = program.command("repo").description("Run repository-scoped workflows.");

repo.command("run")
  .requiredOption("--repo <path>", "Repository root")
  .requiredOption("--goal <goal>", "Repository task goal")
  .option("--workspace-id <workspaceId>", "Repository workspace ID")
  .option("--dry-run", "Plan and require approval before writes", true)
  .option("--apply", "Apply the approved patch immediately", false)
  .option("--require-approval", "Require approval before applying", false)
  .option("--legacy", "Use the original repository task endpoint", false)
  .action(async (options: { readonly repo: string; readonly goal: string; readonly workspaceId?: string; readonly dryRun: boolean; readonly apply: boolean; readonly requireApproval: boolean; readonly legacy: boolean }) => {
    if (!options.legacy) {
      const created = await createRepositoryPlanfile({
        repo_root: options.repo,
        goal: options.goal,
        dry_run: options.dryRun && !options.apply,
        ...(options.workspaceId ? { workspace_id: options.workspaceId } : {}),
      });
      await writeFile(created.path, created.markdown, "utf8");
      if (!options.apply) {
        console.log(JSON.stringify({ plan_id: created.planfile.plan_id, path: created.path, canonical_plan_digest: created.planfile.canonical_plan_digest }, null, 2));
        return;
      }
      console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).applyRepositoryPlanfile({ planfile: created.planfile }), null, 2));
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
  .action(async (options: { readonly repo: string; readonly goal: string; readonly workspaceId?: string; readonly dryRun: boolean }) => {
    const created = await createRepositoryPlanfile({
      repo_root: options.repo,
      goal: options.goal,
      dry_run: options.dryRun,
      ...(options.workspaceId ? { workspace_id: options.workspaceId } : {}),
    });
    await writeFile(created.path, created.markdown, "utf8");
    console.log(JSON.stringify({ plan_id: created.planfile.plan_id, path: created.path, canonical_plan_digest: created.planfile.canonical_plan_digest }, null, 2));
  });

repo.command("apply")
  .argument("<planfile>", "Repository Planfile Markdown or YAML path")
  .option("--allow-dirty-base", "Allow execution when the source worktree has uncommitted changes", false)
  .option("--cleanup-on-success", "Allow cleanup policy to remove retained worktrees later", false)
  .action(async (path: string, options: { readonly allowDirtyBase: boolean; readonly cleanupOnSuccess: boolean }) => {
    const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).applyRepositoryPlanfile({
      planfile,
      allow_dirty_base: options.allowDirtyBase,
      retain_on_failure: !options.cleanupOnSuccess,
    }), null, 2));
  });

repo.command("status").argument("<planId>", "Plan ID, task ID, or task run ID").action(async (planId: string) => {
  const client = await createPlatformClientFromCurrentProfile();
  const status = await client.getRepositoryPlanStatus(planId);
  if (isMissingStatus(status)) console.log(JSON.stringify(await client.getTaskStatus(planId), null, 2));
  else console.log(JSON.stringify(status, null, 2));
});

repo.command("diff").argument("<taskId>", "Task ID or task run ID").action(async (taskId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getArtifact("diff", { task_id: taskId, type: "diff" }), null, 2));
});

repo.command("patch")
  .argument("<planId>", "Repository plan ID")
  .option("--output <path>", "Write final patch to a file")
  .action(async (planId: string, options: { readonly output?: string }) => {
    const patch = await (await createPlatformClientFromCurrentProfile()).getRepositoryPlanPatch(planId);
    if (options.output && isPatchArtifact(patch)) {
      await writeFile(options.output, patch.unified_diff, "utf8");
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
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).cleanupRepositoryPlan(planId), null, 2));
});

repo.command("approve").argument("<taskId>", "Task ID or task run ID").requiredOption("--reason <reason>", "Approval reason").option("--approved-by <approvedBy>", "Approver identifier", "human-local").action(async (taskId: string, options: { readonly reason: string; readonly approvedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).approveTask(taskId, { decided_by: options.approvedBy, reason: options.reason }), null, 2));
});

repo.command("reject").argument("<taskId>", "Task ID or task run ID").requiredOption("--reason <reason>", "Rejection reason").option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local").action(async (taskId: string, options: { readonly reason: string; readonly rejectedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).rejectTask(taskId, { decided_by: options.rejectedBy, reason: options.reason }), null, 2));
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

plan.command("apply").argument("<planfile>", "Planfile Markdown or YAML path").action(async (path: string) => {
  const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(path));
  const validation = validatePlanfile(planfile);
  if (!validation.ok) {
    console.log(JSON.stringify({ ...validation, plan_id: planfile.plan_id }, null, 2));
    process.exitCode = 1;
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

plan.command("approve").argument("<planId>", "Plan ID").requiredOption("--reason <reason>", "Approval reason").option("--approved-by <approvedBy>", "Approver identifier", "human-local").action(async (planId: string, options: { readonly reason: string; readonly approvedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).approvePlan(planId, { decided_by: options.approvedBy, reason: options.reason }), null, 2));
});

plan.command("reject").argument("<planId>", "Plan ID").requiredOption("--reason <reason>", "Rejection reason").option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local").action(async (planId: string, options: { readonly reason: string; readonly rejectedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).rejectPlan(planId, { decided_by: options.rejectedBy, reason: options.reason }), null, 2));
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

function isMissingStatus(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "status" in value && (value as { readonly status?: unknown }).status === "missing");
}

function isPatchArtifact(value: unknown): value is { readonly plan_id: string; readonly unified_diff: string; readonly changed_files: readonly string[] } {
  return Boolean(value && typeof value === "object"
    && typeof (value as { readonly plan_id?: unknown }).plan_id === "string"
    && typeof (value as { readonly unified_diff?: unknown }).unified_diff === "string"
    && Array.isArray((value as { readonly changed_files?: unknown }).changed_files));
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
