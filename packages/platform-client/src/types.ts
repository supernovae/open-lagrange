export interface PlatformClientOptions {
  readonly apiUrl: string;
  readonly authToken?: string;
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

export interface ApplyRepositoryPlanfileInput {
  readonly planfile: unknown;
  readonly allow_dirty_base?: boolean;
  readonly retain_on_failure?: boolean;
}
