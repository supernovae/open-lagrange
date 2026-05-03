import { getCurrentProfile } from "@open-lagrange/runtime-manager";
import type { RuntimeProfile } from "@open-lagrange/runtime-manager";
import { resolveProfileAuthToken } from "@open-lagrange/runtime-manager";
import type { ApprovalInput, ApplyPlanfileInput, ApplyRepositoryPlanfileInput, CreateBuilderRunInput, CreateRunInput, PlatformClientOptions, SubmitProjectInput, SubmitRepositoryGoalInput } from "./types.js";

export class PlatformClient {
  constructor(private readonly options: PlatformClientOptions) {}

  async getRuntimeStatus(): Promise<unknown> {
    return this.get("/v1/runtime/status");
  }

  async listPacks(): Promise<unknown> {
    return this.get("/v1/runtime/packs");
  }

  async getCapabilitiesSummary(): Promise<unknown> {
    return this.get("/v1/chat/capabilities");
  }

  async classifyIntent(text: string): Promise<unknown> {
    return this.post("/v1/chat/intent", { text });
  }

  async getSuggestedFlows(text?: string): Promise<unknown> {
    return this.post("/v1/chat/suggested-flows", text ? { text } : {});
  }

  async getVersion(): Promise<unknown> {
    return this.get("/v1/runtime/version");
  }

  async submitProject(input: SubmitProjectInput): Promise<unknown> {
    return this.post("/v1/projects", input);
  }

  async submitRepositoryGoal(input: SubmitRepositoryGoalInput): Promise<unknown> {
    return this.post("/v1/projects", { ...input, kind: "repository" });
  }

  async applyRepositoryPlanfile(input: ApplyRepositoryPlanfileInput): Promise<unknown> {
    return this.post("/v1/repository/plans/apply", input);
  }

  async getRepositoryPlanStatus(planId: string): Promise<unknown> {
    return this.get(`/v1/repository/plans/${encodeURIComponent(planId)}`);
  }

  async getRepositoryPlanPatch(planId: string): Promise<unknown> {
    return this.get(`/v1/repository/plans/${encodeURIComponent(planId)}/patch`);
  }

  async getRepositoryPlanReview(planId: string): Promise<unknown> {
    return this.get(`/v1/repository/plans/${encodeURIComponent(planId)}/review`);
  }

  async cleanupRepositoryPlan(planId: string): Promise<unknown> {
    return this.post(`/v1/repository/plans/${encodeURIComponent(planId)}/cleanup`, {});
  }

  async resumeRepositoryPlan(planId: string): Promise<unknown> {
    return this.post(`/v1/repository/plans/${encodeURIComponent(planId)}/resume`, {});
  }

  async getPendingRepositoryScopeRequests(planId: string): Promise<unknown> {
    return this.get(`/v1/repository/plans/${encodeURIComponent(planId)}/scope`);
  }

  async approveRepositoryScopeRequest(requestId: string, input: { readonly decided_by?: string; readonly reason: string }): Promise<unknown> {
    return this.post(`/v1/repository/scope/${encodeURIComponent(requestId)}/approve`, {
      ...(input.decided_by ? { approved_by: input.decided_by } : {}),
      reason: input.reason,
    });
  }

  async rejectRepositoryScopeRequest(requestId: string, input: { readonly decided_by?: string; readonly reason: string }): Promise<unknown> {
    return this.post(`/v1/repository/scope/${encodeURIComponent(requestId)}/reject`, {
      ...(input.decided_by ? { rejected_by: input.decided_by } : {}),
      reason: input.reason,
    });
  }

  async getProjectStatus(projectId: string): Promise<unknown> {
    return this.get(`/v1/projects/${encodeURIComponent(projectId)}`);
  }

  async getTaskStatus(taskId: string): Promise<unknown> {
    return this.get(`/v1/tasks/${encodeURIComponent(taskId)}`);
  }

  async applyPlanfile(input: ApplyPlanfileInput): Promise<unknown> {
    return this.post("/v1/plans/apply", input);
  }

  async createRunFromPlan(input: CreateRunInput): Promise<unknown> {
    if (input.planfile_path) return this.post("/v1/runs", { source: "planfile_path", planfile_path: input.planfile_path, live: input.live ?? true });
    return this.post("/v1/runs", { source: "planfile", planfile: input.planfile, live: input.live ?? true });
  }

  async createRunFromBuilderSession(input: CreateBuilderRunInput): Promise<unknown> {
    return this.post("/v1/runs", { source: "builder_session", session_id: input.session_id, live: input.live ?? true });
  }

  async getRunSnapshot(runId: string): Promise<unknown> {
    return this.get(`/v1/runs/${encodeURIComponent(runId)}`);
  }

  async getRunEvents(runId: string): Promise<unknown> {
    return this.get(`/v1/runs/${encodeURIComponent(runId)}/events`);
  }

  async approveRunRequest(runId: string, approvalId: string, input: { readonly decided_by?: string; readonly reason?: string } = {}): Promise<unknown> {
    return this.post(`/v1/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/approve`, input);
  }

  async rejectRunRequest(runId: string, approvalId: string, input: { readonly decided_by?: string; readonly reason?: string } = {}): Promise<unknown> {
    return this.post(`/v1/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/reject`, input);
  }

  async resumeRun(runId: string): Promise<unknown> {
    return this.post(`/v1/runs/${encodeURIComponent(runId)}/resume`, {});
  }

  async retryRunNode(runId: string, nodeId: string, replayMode: "reuse-artifacts" | "refresh-artifacts" | "force-new-idempotency-key"): Promise<unknown> {
    return this.post(`/v1/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/retry`, { replay_mode: replayMode });
  }

  async cancelRun(runId: string): Promise<unknown> {
    return this.post(`/v1/runs/${encodeURIComponent(runId)}/cancel`, {});
  }

  async exportRunArtifact(runId: string, artifactId: string): Promise<unknown> {
    return this.getArtifact(artifactId, { run_id: runId });
  }

  async resumePlan(planId: string): Promise<unknown> {
    return this.post(`/v1/plans/${encodeURIComponent(planId)}/resume`, {});
  }

  async getPlanStatus(planId: string): Promise<unknown> {
    return this.get(`/v1/plans/${encodeURIComponent(planId)}`);
  }

  async approvePlan(planId: string, input: ApprovalInput): Promise<unknown> {
    return this.post(`/v1/plans/${encodeURIComponent(planId)}/approve`, {
      approved_by: input.decided_by,
      reason: input.reason,
      approval_token: input.approval_token,
    });
  }

  async rejectPlan(planId: string, input: ApprovalInput): Promise<unknown> {
    return this.post(`/v1/plans/${encodeURIComponent(planId)}/reject`, {
      rejected_by: input.decided_by,
      reason: input.reason,
      approval_token: input.approval_token,
    });
  }

  async submitUserFrameEvent(event: unknown): Promise<unknown> {
    return this.post("/v1/events", event);
  }

  async approveTask(taskId: string, input: ApprovalInput): Promise<unknown> {
    return this.post(`/v1/tasks/${encodeURIComponent(taskId)}/approve`, {
      approved_by: input.decided_by,
      reason: input.reason,
      approval_token: input.approval_token,
    });
  }

  async rejectTask(taskId: string, input: ApprovalInput): Promise<unknown> {
    return this.post(`/v1/tasks/${encodeURIComponent(taskId)}/reject`, {
      rejected_by: input.decided_by,
      reason: input.reason,
      approval_token: input.approval_token,
    });
  }

  async getArtifact(artifactId: string, query: Record<string, string> = {}): Promise<unknown> {
    const params = new URLSearchParams(query);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.get(`/v1/artifacts/${encodeURIComponent(artifactId)}${suffix}`);
  }

  private async get(path: string): Promise<unknown> {
    return this.request(path, { method: "GET" });
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    return this.request(path, { method: "POST", body: JSON.stringify(body) });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(new URL(path, this.options.apiUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.options.authToken ? { authorization: `Bearer ${this.options.authToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) as unknown : undefined;
    if (!response.ok) throw new Error(`Control Plane API ${response.status}: ${text}`);
    return data;
  }
}

export async function createPlatformClientFromCurrentProfile(): Promise<PlatformClient> {
  const profile = await getCurrentProfile();
  const authToken = await resolveProfileAuthToken(profile) ?? process.env.OPEN_LAGRANGE_API_TOKEN;
  return new PlatformClient({ apiUrl: profile.apiUrl, ...(authToken ? { authToken } : {}) });
}

export function createPlatformClientFromProfile(profile: RuntimeProfile): PlatformClient {
  const authToken = (profile.auth?.type === "token" && profile.auth.tokenEnv ? process.env[profile.auth.tokenEnv] : undefined) ?? process.env.OPEN_LAGRANGE_API_TOKEN;
  return new PlatformClient({ apiUrl: profile.apiUrl, ...(authToken ? { authToken } : {}) });
}
