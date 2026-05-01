# Repair And Scope Expansion

Repair uses the same EvidenceBundle and PatchPlan validation path as the initial patch. In repair mode, the model also receives the latest verification failure summary, current changed files, current diff summary, and prior repair attempts.

## Repair Rules

- Repair stays within current allowed files by default.
- Repair cannot add files, change commands, or broaden scope silently.
- Repeated failures escalate to a stronger configured model role when available, otherwise the run yields.
- Repair PatchPlans pass through schema validation, evidence-ref checks, PatchValidator, approval checks, and worktree-only application.

## Scope Expansion

When more files, capabilities, commands, or risk are needed, the model must set `requires_scope_expansion: true` and include a ScopeExpansionRequest.

The request is validated and recorded as an ApprovalRequest with `requested_capability: "repo.scope_expansion"`. Repository status shows the reason, requested files, requested commands, evidence refs, approval status, and suggested commands:

```bash
open-lagrange repo scope approve <request_id> --reason "<reason>"
open-lagrange repo scope reject <request_id> --reason "<reason>"
```

Approval uses the existing approval store. Rejection yields. No scope expansion proceeds without a recorded approval decision.
