import { ApprovalRequest, type ApprovalRequest as ApprovalRequestType } from "../schemas/reconciliation.js";

export type ApprovalDecision =
  | { readonly status: "requested"; readonly request: ApprovalRequestType }
  | { readonly status: "approved"; readonly request: ApprovalRequestType; readonly decided_at: string; readonly decided_by: string }
  | { readonly status: "rejected"; readonly request: ApprovalRequestType; readonly decided_at: string; readonly decided_by: string; readonly reason: string };

export interface ApprovalStore {
  readonly createApprovalRequest: (request: ApprovalRequestType) => Promise<ApprovalDecision>;
  readonly getApprovalRequest: (approvalId: string) => Promise<ApprovalDecision | undefined>;
  readonly approveRequest: (approvalId: string, decidedBy: string, decidedAt: string) => Promise<ApprovalDecision | undefined>;
  readonly rejectRequest: (approvalId: string, decidedBy: string, decidedAt: string, reason: string) => Promise<ApprovalDecision | undefined>;
}

const approvals = new Map<string, ApprovalDecision>();

export const inMemoryApprovalStore: ApprovalStore = {
  async createApprovalRequest(request) {
    const parsed = ApprovalRequest.parse(request);
    const decision: ApprovalDecision = { status: "requested", request: parsed };
    approvals.set(parsed.approval_id, decision);
    return decision;
  },
  async getApprovalRequest(approvalId) {
    return approvals.get(approvalId);
  },
  async approveRequest(approvalId, decidedBy, decidedAt) {
    const existing = approvals.get(approvalId);
    if (!existing) return undefined;
    const decision: ApprovalDecision = {
      status: "approved",
      request: existing.request,
      decided_at: decidedAt,
      decided_by: decidedBy,
    };
    approvals.set(approvalId, decision);
    return decision;
  },
  async rejectRequest(approvalId, decidedBy, decidedAt, reason) {
    const existing = approvals.get(approvalId);
    if (!existing) return undefined;
    const decision: ApprovalDecision = {
      status: "rejected",
      request: existing.request,
      decided_at: decidedAt,
      decided_by: decidedBy,
      reason,
    };
    approvals.set(approvalId, decision);
    return decision;
  },
};
