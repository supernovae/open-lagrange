import type { UserFrameEvent } from "@open-lagrange/core/interface";
import type { SuggestedFlow } from "@open-lagrange/core/interface";
import { routeTuiInput } from "./input-router.js";
import type { ParsedInput } from "./types.js";

export interface ParseContext {
  readonly project_id?: string;
  readonly task_id?: string;
  readonly approval_request_id?: string;
  readonly repo_path?: string;
  readonly workspace_id?: string;
  readonly dry_run?: boolean;
  readonly pendingFlow?: SuggestedFlow;
}

export function parseUserInput(text: string, context: ParseContext): ParsedInput {
  const parsed = routeTuiInput(text, context);
  if (parsed.kind !== "event" && parsed.kind !== "command") return parsed;
  if (!parsed.event || !("type" in parsed.event)) return parsed;
  return parsed;
}

export function legacySubmitGoal(text: string, context: ParseContext): UserFrameEvent {
  return {
    type: "submit_goal",
    text,
    ...(context.repo_path ? { repo_path: context.repo_path } : {}),
    ...(context.workspace_id ? { workspace_id: context.workspace_id } : {}),
    ...(context.dry_run === undefined ? {} : { dry_run: context.dry_run }),
  };
}
