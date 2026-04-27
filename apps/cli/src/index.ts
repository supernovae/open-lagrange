#!/usr/bin/env node
import { spawn } from "node:child_process";
import { Command } from "commander";
import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import { addLocalProfile, addRemoteProfile, getCurrentProfile, initRuntime, loadConfig, removeProfile, restartLocalRuntime, runDoctor, setCurrentProfile, startLocalRuntime, stopLocalRuntime, tailLogs, getRuntimeStatus } from "@open-lagrange/runtime-manager";

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

const repo = program.command("repo").description("Run repository-scoped workflows.");

repo.command("run")
  .requiredOption("--repo <path>", "Repository root")
  .requiredOption("--goal <goal>", "Repository task goal")
  .option("--workspace-id <workspaceId>", "Repository workspace ID")
  .option("--dry-run", "Plan and require approval before writes", true)
  .option("--apply", "Apply the approved patch immediately", false)
  .option("--require-approval", "Require approval before applying", false)
  .action(async (options: { readonly repo: string; readonly goal: string; readonly workspaceId?: string; readonly dryRun: boolean; readonly apply: boolean; readonly requireApproval: boolean }) => {
    console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).submitRepositoryGoal({
      goal: options.goal,
      repo_root: options.repo,
      ...(options.workspaceId ? { workspace_id: options.workspaceId } : {}),
      dry_run: options.dryRun && !options.apply,
      apply: options.apply,
      require_approval: options.requireApproval,
    }), null, 2));
  });

repo.command("status").argument("<taskId>", "Task ID or task run ID").action(async (taskId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getTaskStatus(taskId), null, 2));
});

repo.command("diff").argument("<taskId>", "Task ID or task run ID").action(async (taskId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getArtifact("diff", { task_id: taskId, type: "diff" }), null, 2));
});

repo.command("review").argument("<taskId>", "Task ID or task run ID").action(async (taskId: string) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).getArtifact("review", { task_id: taskId, type: "review" }), null, 2));
});

repo.command("approve").argument("<taskId>", "Task ID or task run ID").requiredOption("--reason <reason>", "Approval reason").option("--approved-by <approvedBy>", "Approver identifier", "human-local").action(async (taskId: string, options: { readonly reason: string; readonly approvedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).approveTask(taskId, { decided_by: options.approvedBy, reason: options.reason }), null, 2));
});

repo.command("reject").argument("<taskId>", "Task ID or task run ID").requiredOption("--reason <reason>", "Rejection reason").option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local").action(async (taskId: string, options: { readonly reason: string; readonly rejectedBy: string }) => {
  console.log(JSON.stringify(await (await createPlatformClientFromCurrentProfile()).rejectTask(taskId, { decided_by: options.rejectedBy, reason: options.reason }), null, 2));
});

await program.parseAsync(process.argv);

function runtimeOption(value: string | undefined): "docker" | "podman" | undefined {
  if (value === "docker" || value === "podman") return value;
  if (!value) return undefined;
  throw new Error("--runtime must be docker or podman");
}
