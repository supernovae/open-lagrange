import { getHatchetClient } from "./client.js";
import { createApprovalRequestTask } from "../tasks/create-approval-request.js";
import { discoverCapabilitiesTask } from "../tasks/discover-capabilities.js";
import { executeMcpIntentTask } from "../tasks/execute-mcp-intent.js";
import { generateExecutionPlanTask } from "../tasks/generate-execution-plan.js";
import { generateTaskArtifactTask } from "../tasks/generate-task-artifact.js";
import { generateRepositoryPatchPlanTask } from "../tasks/generate-repository-patch-plan.js";
import { generateRepositoryReviewTask } from "../tasks/generate-repository-review.js";
import { discoverRepositoryCapabilitiesTask } from "../tasks/repository-capabilities.js";
import { loadApprovalContinuationTask } from "../tasks/load-approval-continuation.js";
import { loadApprovalContinuationEnvelopeTask } from "../tasks/load-approval-continuation-envelope.js";
import { loadRepositoryWorkspaceTask } from "../tasks/load-repository-workspace.js";
import { recordApprovalContinuationEnvelopeTask } from "../tasks/record-approval-continuation-envelope.js";
import { recordContinuationContextTask } from "../tasks/record-continuation-context.js";
import { recordStatusTask } from "../tasks/record-status.js";
import { readRepositoryFilesTask } from "../tasks/read-repository-files.js";
import { applyRepositoryPatchTask, proposeRepositoryPatchTask } from "../tasks/repository-patch.js";
import { getRepositoryDiffTask, runRepositoryVerificationTask } from "../tasks/repository-verify.js";
import { runCriticTask } from "../tasks/run-critic.js";
import { projectReconciler } from "../workflows/project-reconciler.js";
import { planNodeReplayWorkflow } from "../workflows/plan-node-replay.js";
import { planRunCancelWorkflow } from "../workflows/plan-run-cancel.js";
import { planRunContinuationWorkflow } from "../workflows/plan-run-continuation.js";
import { planRunWorkflow } from "../workflows/plan-run-workflow.js";
import { repositoryTaskContinuation } from "../workflows/repository-task-continuation.js";
import { repositoryTaskReconciler } from "../workflows/repository-task-reconciler.js";
import { repositoryVerificationRequest } from "../workflows/repository-verification-request.js";
import { taskContinuation } from "../workflows/task-continuation.js";
import { taskReconciler } from "../workflows/task-reconciler.js";
import { startWorkerHealthServer } from "./worker-health.js";

export const OPEN_LAGRANGE_WORKER_NAME = "open-lagrange-worker";

export const OPEN_LAGRANGE_WORKFLOWS = [
  projectReconciler,
  planRunWorkflow,
  planRunContinuationWorkflow,
  planNodeReplayWorkflow,
  planRunCancelWorkflow,
  taskReconciler,
  taskContinuation,
  repositoryTaskReconciler,
  repositoryTaskContinuation,
  repositoryVerificationRequest,
  generateExecutionPlanTask,
  discoverCapabilitiesTask,
  generateTaskArtifactTask,
  executeMcpIntentTask,
  runCriticTask,
  recordStatusTask,
  recordContinuationContextTask,
  recordApprovalContinuationEnvelopeTask,
  loadApprovalContinuationTask,
  loadApprovalContinuationEnvelopeTask,
  createApprovalRequestTask,
  loadRepositoryWorkspaceTask,
  discoverRepositoryCapabilitiesTask,
  readRepositoryFilesTask,
  generateRepositoryPatchPlanTask,
  proposeRepositoryPatchTask,
  applyRepositoryPatchTask,
  runRepositoryVerificationTask,
  getRepositoryDiffTask,
  generateRepositoryReviewTask,
] as const;

export async function startOpenLagrangeWorker(): Promise<void> {
  const health = startWorkerHealthServer({ name: OPEN_LAGRANGE_WORKER_NAME });
  const worker = await getHatchetClient().worker(OPEN_LAGRANGE_WORKER_NAME, {
    handleKill: true,
    labels: {
      runtime: "open-lagrange",
    },
  });
  await worker.registerWorkflows([...OPEN_LAGRANGE_WORKFLOWS]);
  health.setRunning(OPEN_LAGRANGE_WORKFLOWS.length);
  await worker.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startOpenLagrangeWorker();
}
