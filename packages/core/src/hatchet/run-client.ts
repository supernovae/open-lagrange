import { cancelRun, createRunFromPlanfile, resumeRun, retryRunNode } from "../planning/control-plane.js";
import type { Planfile } from "../planning/planfile-schema.js";
import type { RetryReplayMode } from "../runs/node-attempt.js";

export function createDurableRunFromPlan(input: {
  readonly planfile: Planfile;
  readonly live?: boolean;
  readonly output_dir?: string;
  readonly run_id?: string;
  readonly now?: string;
}) {
  return createRunFromPlanfile(input);
}

export function resumeDurableRun(input: {
  readonly run_id: string;
  readonly now?: string;
}) {
  return resumeRun(input);
}

export function retryDurableNode(input: {
  readonly run_id: string;
  readonly node_id: string;
  readonly replay_mode: RetryReplayMode | string;
  readonly now?: string;
}) {
  return retryRunNode(input);
}

export function cancelDurableRun(input: {
  readonly run_id: string;
  readonly now?: string;
}) {
  return cancelRun(input);
}
