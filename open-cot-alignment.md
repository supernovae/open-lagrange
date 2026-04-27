# Open-COT Alignment

Open Lagrange treats Open-COT as the canonical portable interface layer.
Runtime-specific choices stay local; reusable interfaces should move upstream.

## Current Concept Mapping

| Open Lagrange concept | Portable Open-COT concept | Current location |
| --- | --- | --- |
| Cognitive Artifact | CognitiveArtifact | `packages/core/src/schemas/open-cot.ts` |
| Execution Plan | ExecutionPlan | local compatibility schema; RFC 0007 candidate |
| Execution Intent | ExecutionIntent | local compatibility schema |
| Capability Snapshot | CapabilitySnapshot | local compatibility schema |
| Delegation Context | DelegationContext | local compatibility schema; RFC 0009 candidate |
| Observation | Observation | local compatibility schema |
| Reconciliation Result | ReconciliationResult | local compatibility schema |
| Structured Error | StructuredError | local compatibility schema |
| Approval Request | ApprovalRequest | new portable candidate |
| Approval Decision | ApprovalDecision | new portable candidate |
| Continuation Input | ApprovalContinuationInput | new portable candidate |
| Continuation Envelope | ApprovalContinuationEnvelope | new portable candidate |
| Capability Pack | CapabilityPack | new portable candidate |
| Capability Descriptor | CapabilityDescriptor | local SDK and compatibility schema |
| Capability Execution Result | CapabilityExecutionResult | new portable candidate |
| Side Effect Kind | SideEffectKind | new portable candidate |
| Idempotency Mode | IdempotencyMode | new portable candidate |
| Patch Plan | PatchPlan | new portable candidate |
| Verification Report | VerificationReport | new portable candidate |
| Review Report | ReviewReport | new portable candidate |

## Open Lagrange Implementation Details

These should not become Open-COT requirements:

- Hatchet workflow name, run ID, worker name, retry policy, and continuation
  workflow.
- Next.js API route and UI shape.
- SQLite local state store and future Postgres provider.
- Mock MCP registry and mock endpoint client.
- Local policy gate implementation.
- Vercel AI SDK task wrapper.
- Local repository path policy, command allowlist, and repository capability
  pack executor.
- Next.js repository route names and CLI repository command names.
- Static Pack Registry implementation and Hatchet task wrappers around pack
  execution.

## Proposed Open-COT Additions

Required additions:

```ts
export const ApprovalRequest = z.object({
  approval_request_id: z.string().min(1),
  task_id: z.string().min(1),
  project_id: z.string().min(1),
  intent_id: z.string().min(1),
  requested_risk_level: RiskLevel,
  requested_capability: z.string().min(1),
  task_run_id: z.string().min(1),
  requested_at: z.string().datetime(),
  prompt: z.string(),
  trace_id: z.string().min(1),
}).strict();

export const ApprovalDecision = z.object({
  approval_request_id: z.string().min(1),
  task_id: z.string().min(1),
  project_id: z.string().min(1),
  intent_id: z.string().min(1),
  requested_risk_level: RiskLevel,
  requested_capability: z.string().min(1),
  requested_at: z.string().datetime(),
  decision: z.enum(["requested", "approved", "rejected"]),
  approved_by: z.string().min(1).optional(),
  rejected_by: z.string().min(1).optional(),
  decided_at: z.string().datetime().optional(),
  reason: z.string().optional(),
  trace_id: z.string().min(1),
}).strict();

export const ApprovalContinuationInput = z.object({
  approval_request_id: z.string().min(1),
  task_run_id: z.string().min(1),
}).strict();

export const ApprovalContinuationEnvelope = z.object({
  kind: z.string().min(1),
  approval_request: ApprovalRequest,
  project_id: z.string().min(1),
  task_run_id: z.string().min(1),
  trace_id: z.string().min(1),
  payload: z.unknown(),
}).strict();
```

Recommended additions:

- Add `approval_request` linkage to task reconciliation results when status is
  `requires_approval`.
- Add policy audit context that records validation inputs separately from schema
  validation.
- Clarify that approval allows a previously validated intent to proceed; it
  does not alter arguments, capability digest, risk level, or delegated
  authority.
- Define continuation envelopes as a portable control-plane handoff: the core
  fields identify the approved request and continuation kind, while extension
  schemas validate domain-specific payloads.

Future additions:

- Endpoint receipt hashes for input/output audit.
- Budget conformance records.
- Extension RFC for MCP endpoint binding terminology.
- Extension RFC for repository task artifacts if Open-COT chooses to standardize
  PatchPlan, VerificationReport, and ReviewReport outside the core layer.

Repository task additions:

```ts
export const FilePatch = z.object({
  relative_path: z.string().min(1),
  operation: z.enum(["create", "modify", "delete"]),
  expected_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  unified_diff: z.string().optional(),
  full_replacement: z.string().optional(),
  append_text: z.string().optional(),
  rationale: z.string().min(1),
}).strict();

export const PatchPlan = z.object({
  patch_plan_id: z.string().min(1),
  goal: z.string().min(1),
  summary: z.string().min(1),
  files: z.array(FilePatch).min(1),
  expected_preconditions: z.array(z.string()),
  risk_level: RiskLevel,
  requires_approval: z.boolean(),
  idempotency_key: z.string().min(1),
}).strict();

export const VerificationResult = z.object({
  command_id: z.string().min(1),
  command: z.string().min(1),
  exit_code: z.number().int(),
  stdout_preview: z.string(),
  stderr_preview: z.string(),
  duration_ms: z.number().int().min(0),
  truncated: z.boolean(),
}).strict();

export const VerificationReport = z.object({
  results: z.array(VerificationResult),
  passed: z.boolean(),
  summary: z.string(),
}).strict();

export const ReviewReport = z.object({
  pr_title: z.string().min(1),
  pr_summary: z.string().min(1),
  test_notes: z.array(z.string()),
  risk_notes: z.array(z.string()),
  follow_up_notes: z.array(z.string()),
}).strict();
```

PatchPlan may belong in an Open-COT extension first because patch semantics are
domain-specific. VerificationReport and ReviewReport are broadly portable if
they remain domain-neutral and avoid requiring local repository paths.

Capability Pack SDK candidates:

```ts
export const SideEffectKind = z.enum([
  "none",
  "filesystem_read",
  "filesystem_write",
  "network_read",
  "network_write",
  "process_execution",
  "cloud_control_plane",
  "repository_mutation",
  "ticket_mutation",
  "message_send",
]);

export const IdempotencyMode = z.enum([
  "required",
  "recommended",
  "not_applicable",
]);

export const CapabilityDescriptor = z.object({
  capability_id: z.string().min(1),
  pack_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
  risk_level: RiskLevel,
  side_effect_kind: SideEffectKind,
  requires_approval: z.boolean(),
  idempotency_mode: IdempotencyMode,
  timeout_ms: z.number().int().min(1),
  max_attempts: z.number().int().min(1),
  scopes: z.array(z.string()),
  tags: z.array(z.string()),
  examples: z.array(z.unknown()),
  capability_digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const CapabilityExecutionResult = z.object({
  status: z.enum(["success", "failed", "yielded", "requires_approval"]),
  output: z.unknown().optional(),
  observations: z.array(z.unknown()),
  structured_errors: z.array(StructuredError),
  artifacts: z.array(z.unknown()),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
  duration_ms: z.number().int().min(0),
  idempotency_key: z.string().min(1),
  retry_after: z.string().datetime().optional(),
  approval_request: ApprovalRequest.optional(),
}).strict();
```

## Migration Notes

- Existing Open-COT artifacts remain valid if they do not use approval.
- Approval fields are additive except for implementations that already used a
  private approval shape.
- Runtime run IDs can be carried as implementation metadata, but portable
  schemas should rely on task/project IDs and trace IDs.

## Active Upstream Work

| Gap | Classification | Upstream action |
| --- | --- | --- |
| Typed project execution plan | Core candidate for RFC 0007 | PR https://github.com/supernovae/open-cot/pull/73 |
| Delegation context | Core candidate for RFC 0009 | PR https://github.com/supernovae/open-cot/pull/73 |
| Approval request and decision | Core candidate across RFC 0006 and RFC 0010 | Pending PR |
| Continuation input | Core if HITL resume is required for conformance, otherwise extension | Pending PR |
| Continuation envelope | Core candidate for typed approval continuation payloads | Pending PR |
| Capability Pack metadata | Core or extension candidate depending on Open-COT scope | Pending PR |
| Capability Descriptor side effect and idempotency fields | Core candidate for safer snapshots | Pending PR |
| Capability Execution Result | Core candidate for portable endpoint receipts | Pending PR |
| MCP endpoint binding | Extension candidate | Pending PR |
| PatchPlan | Extension candidate for repository/change artifacts | Pending PR |
| VerificationReport and ReviewReport | Core candidate if generalized, extension if repository-scoped | Pending PR |

## Upstream PR Pattern

- Update the relevant RFC markdown first.
- Embed normative JSON Schema between `opencot:schema` markers.
- Run `python3 tools/sync_schemas_from_rfcs.py`.
- Add or update examples.
- Run `python3 tools/validate.py`.
- Open a merge-ready PR in `supernovae/open-cot`.
