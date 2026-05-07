export interface PlatformClientOptions {
  readonly apiUrl: string;
  readonly authToken?: string;
}

export interface RunEventEnvelope {
  readonly event_id: string;
  readonly run_id: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly runtime: "hatchet" | "local_dev";
  readonly event: Record<string, unknown>;
}

export interface RunEventStreamOptions {
  readonly afterEventId?: string;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: RunEventEnvelope) => void | Promise<void>;
  readonly onError?: (error: Error) => void | Promise<void>;
  readonly onReconnect?: (attempt: number, afterEventId: string | undefined) => void | Promise<void>;
}

export interface SubmitProjectInput {
  readonly goal: string;
  readonly workspace_id?: string;
  readonly project_id?: string;
  readonly allowed_scopes?: readonly string[];
}

export interface SubmitRepositoryGoalInput {
  readonly goal: string;
  readonly repo_root: string;
  readonly workspace_id?: string;
  readonly dry_run?: boolean;
  readonly apply?: boolean;
  readonly require_approval?: boolean;
}

export interface ApprovalInput {
  readonly decided_by: string;
  readonly reason: string;
  readonly approval_token: string;
}

export interface ApplyPlanfileInput {
  readonly planfile: unknown;
}

export interface CreateRunInput {
  readonly plan_id?: string;
  readonly planfile?: unknown;
  readonly planfile_path?: string;
  readonly live?: boolean;
}

export interface CreateBuilderRunInput {
  readonly session_id: string;
  readonly live?: boolean;
}

export interface ApplyRepositoryPlanfileInput {
  readonly planfile: unknown;
  readonly allow_dirty_base?: boolean;
  readonly retain_on_failure?: boolean;
}
