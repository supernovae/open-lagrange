import type { ProjectRunStatus, RuntimeHealth, UserFrameEvent } from "@open-lagrange/core/interface";
import type { SuggestedFlow, TuiUserFrameEvent } from "@open-lagrange/core/interface";
import type { TaskStatusSnapshot } from "@open-lagrange/core/interface";

export type PaneId = "home" | "chat" | "timeline" | "tasks" | "plan" | "run" | "approvals" | "diff" | "verification" | "review" | "artifact_json" | "demo" | "research" | "pack_builder" | "doctor" | "capabilities" | "help";
export type InputMode = "chat" | "command" | "approval_reason" | "rejection_reason" | "scope_adjustment";

export interface ConversationTurn {
  readonly turn_id: string;
  readonly role: "user" | "system";
  readonly kind?: "message" | "command" | "suggestion" | "output" | "error" | "copy";
  readonly title?: string;
  readonly status?: "pending" | "completed" | "failed" | "info";
  readonly text: string;
  readonly created_at: string;
  readonly project_id?: string;
  readonly task_id?: string;
  readonly artifact_refs?: readonly string[];
}

export interface ReconciliationTimelineItem {
  readonly event_id: string;
  readonly timestamp: string;
  readonly phase: string;
  readonly title: string;
  readonly summary: string;
  readonly project_id?: string;
  readonly task_id?: string;
  readonly capability_id?: string;
  readonly artifact_id?: string;
  readonly severity?: "info" | "warning" | "error" | "success";
  readonly metadata?: Record<string, unknown>;
}

export interface ApprovalRequestSummary {
  readonly approval_request_id: string;
  readonly task_id: string;
  readonly requested_capability: string;
  readonly requested_risk_level: string;
  readonly prompt: string;
}

export interface ArtifactSummary {
  readonly artifact_id: string;
  readonly artifact_type: "diff" | "review" | "verification" | "plan" | "artifact_json" | "skill_frame" | "workflow_skill" | "pack_build_plan" | "generated_pack" | "pack_manifest" | "pack_validation_report" | "pack_test_report" | "pack_install_report" | "pack_smoke_report" | "policy_decision_report" | "patch_plan" | "patch_artifact" | "source_search_results" | "source_snapshot" | "source_text" | "source_set" | "research_brief" | "citation_index" | "capability_step_result" | "approval_request" | "execution_timeline" | "raw_log";
  readonly title: string;
  readonly value: unknown;
}

export interface ChangedFileSummary {
  readonly path: string;
}

export interface VerificationResultSummary {
  readonly command_id: string;
  readonly command: string;
  readonly exit_code: number;
  readonly duration_ms: number;
  readonly stdout_preview: string;
  readonly stderr_preview: string;
  readonly truncated: boolean;
}

export interface PlanViewSummary {
  readonly plan_id: string;
  readonly status: string;
  readonly current_node?: string;
  readonly worktree_path?: string;
  readonly dag_lines: readonly string[];
  readonly approval_requirements: readonly string[];
  readonly changed_files: readonly string[];
  readonly patch_artifacts: readonly string[];
  readonly verification_reports: readonly string[];
  readonly repair_attempts: readonly string[];
  readonly artifact_refs: readonly string[];
  readonly validation_errors: readonly string[];
}

export interface SkillViewSummary {
  readonly skill_id: string;
  readonly interpreted_goal: string;
  readonly existing_pack_matches: readonly string[];
  readonly missing_capabilities: readonly string[];
  readonly required_scopes: readonly string[];
  readonly required_secret_refs: readonly string[];
  readonly approval_requirements: readonly string[];
  readonly planfile_template?: string;
}

export interface TuiViewModel {
  readonly project?: ProjectRunStatus;
  readonly activeTask?: TaskStatusSnapshot;
  readonly conversation: readonly ConversationTurn[];
  readonly timeline: readonly ReconciliationTimelineItem[];
  readonly approvals: readonly ApprovalRequestSummary[];
  readonly artifacts: readonly ArtifactSummary[];
  readonly changedFiles: readonly ChangedFileSummary[];
  readonly verificationResults: readonly VerificationResultSummary[];
  readonly plan?: PlanViewSummary;
  readonly skill?: SkillViewSummary;
  readonly pendingFlow?: SuggestedFlow;
  readonly selectedPane: PaneId;
  readonly scrollOffset: number;
  readonly inputMode: InputMode;
  readonly isLoading: boolean;
  readonly health: RuntimeHealth;
  readonly lastError?: string;
}

export type ParsedInput =
  | { readonly kind: "command"; readonly command: string; readonly event?: UserFrameEvent | TuiUserFrameEvent | undefined; readonly pane?: PaneId; readonly quit?: boolean; readonly attachProjectId?: string; readonly error?: string }
  | { readonly kind: "event"; readonly event: UserFrameEvent | TuiUserFrameEvent }
  | { readonly kind: "suggestion"; readonly flow: SuggestedFlow; readonly message?: string }
  | { readonly kind: "suggestions"; readonly flows: readonly SuggestedFlow[]; readonly message: string }
  | { readonly kind: "empty" };
