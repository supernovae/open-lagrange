import {
  ApprovalContinuationContext,
  ApprovalContinuationEnvelope,
  ApprovalDecision,
  ApprovalRequest,
  type ApprovalContinuationContext as ApprovalContinuationContextType,
  type ApprovalContinuationEnvelope as ApprovalContinuationEnvelopeType,
  type ApprovalDecision as ApprovalDecisionType,
  type ApprovalRequest as ApprovalRequestType,
} from "../schemas/reconciliation.js";

export interface ApprovalStore {
  readonly createApprovalRequest: (request: ApprovalRequestType) => Promise<ApprovalDecisionType>;
  readonly getApprovalDecision: (approvalRequestId: string) => Promise<ApprovalDecisionType | undefined>;
  readonly getApprovalDecisionForTask: (taskIdOrRunId: string) => Promise<ApprovalDecisionType | undefined>;
  readonly approveRequest: (approvalRequestId: string, approvedBy: string, decidedAt: string, reason: string) => Promise<ApprovalDecisionType | undefined>;
  readonly rejectRequest: (approvalRequestId: string, rejectedBy: string, decidedAt: string, reason: string) => Promise<ApprovalDecisionType | undefined>;
  readonly recordContinuationContext: (context: ApprovalContinuationContextType) => Promise<ApprovalContinuationContextType>;
  readonly getContinuationContext: (approvalRequestId: string) => Promise<ApprovalContinuationContextType | undefined>;
  readonly recordApprovalContinuationEnvelope: (envelope: ApprovalContinuationEnvelopeType) => Promise<ApprovalContinuationEnvelopeType>;
  readonly getApprovalContinuationEnvelope: (approvalRequestId: string) => Promise<ApprovalContinuationEnvelopeType | undefined>;
}

const approvals = new Map<string, ApprovalDecisionType>();
const continuations = new Map<string, ApprovalContinuationContextType>();
const continuationEnvelopes = new Map<string, ApprovalContinuationEnvelopeType>();

export const inMemoryApprovalStore: ApprovalStore = {
  async createApprovalRequest(request) {
    const parsed = ApprovalRequest.parse(request);
    const decision = ApprovalDecision.parse({
      approval_request_id: parsed.approval_request_id,
      task_id: parsed.task_id,
      project_id: parsed.project_id,
      intent_id: parsed.intent_id,
      requested_risk_level: parsed.requested_risk_level,
      requested_capability: parsed.requested_capability,
      requested_at: parsed.requested_at,
      decision: "requested",
      trace_id: parsed.trace_id,
    });
    approvals.set(parsed.approval_request_id, decision);
    return decision;
  },
  async getApprovalDecision(approvalRequestId) {
    return approvals.get(approvalRequestId);
  },
  async getApprovalDecisionForTask(taskIdOrRunId) {
    return [...approvals.values()].find((decision) =>
      decision.task_id === taskIdOrRunId || continuations.get(decision.approval_request_id)?.task_run_id === taskIdOrRunId,
    );
  },
  async approveRequest(approvalRequestId, approvedBy, decidedAt, reason) {
    const existing = approvals.get(approvalRequestId);
    if (!existing) return undefined;
    const decision = ApprovalDecision.parse({
      ...existing,
      decision: "approved",
      decided_at: decidedAt,
      approved_by: approvedBy,
      reason,
    });
    approvals.set(approvalRequestId, decision);
    return decision;
  },
  async rejectRequest(approvalRequestId, rejectedBy, decidedAt, reason) {
    const existing = approvals.get(approvalRequestId);
    if (!existing) return undefined;
    const decision = ApprovalDecision.parse({
      ...existing,
      decision: "rejected",
      decided_at: decidedAt,
      rejected_by: rejectedBy,
      reason,
    });
    approvals.set(approvalRequestId, decision);
    return decision;
  },
  async recordContinuationContext(context) {
    const parsed = ApprovalContinuationContext.parse(context);
    continuations.set(parsed.approval_request.approval_request_id, parsed);
    return parsed;
  },
  async getContinuationContext(approvalRequestId) {
    return continuations.get(approvalRequestId);
  },
  async recordApprovalContinuationEnvelope(envelope) {
    const parsed = ApprovalContinuationEnvelope.parse(envelope);
    continuationEnvelopes.set(parsed.approval_request.approval_request_id, parsed);
    return parsed;
  },
  async getApprovalContinuationEnvelope(approvalRequestId) {
    return continuationEnvelopes.get(approvalRequestId);
  },
};
