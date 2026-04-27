import { getHatchetClient } from "./client.js";
import { createApprovalRequestTask } from "../tasks/create-approval-request.js";
import { discoverCapabilitiesTask } from "../tasks/discover-capabilities.js";
import { executeMcpIntentTask } from "../tasks/execute-mcp-intent.js";
import { generateExecutionPlanTask } from "../tasks/generate-execution-plan.js";
import { generateTaskArtifactTask } from "../tasks/generate-task-artifact.js";
import { recordStatusTask } from "../tasks/record-status.js";
import { runCriticTask } from "../tasks/run-critic.js";
import { projectReconciler } from "../workflows/project-reconciler.js";
import { taskReconciler } from "../workflows/task-reconciler.js";

export const OPEN_LAGRANGE_WORKER_NAME = "open-lagrange-worker";

export const OPEN_LAGRANGE_WORKFLOWS = [
  projectReconciler,
  taskReconciler,
  generateExecutionPlanTask,
  discoverCapabilitiesTask,
  generateTaskArtifactTask,
  executeMcpIntentTask,
  runCriticTask,
  recordStatusTask,
  createApprovalRequestTask,
] as const;

export async function startOpenLagrangeWorker(): Promise<void> {
  const worker = await getHatchetClient().worker(OPEN_LAGRANGE_WORKER_NAME, {
    handleKill: true,
    labels: {
      runtime: "open-lagrange",
    },
  });
  await worker.registerWorkflows([...OPEN_LAGRANGE_WORKFLOWS]);
  await worker.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startOpenLagrangeWorker();
}
