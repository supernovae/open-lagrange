# Scope Expansion Resume

Repository scope expansion is approval-backed because a PatchPlan may need files, capabilities, verification commands, or risk beyond the current WorkOrder. The model may request that scope, but it cannot receive or use it until the request is approved.

Flow:

```bash
open-lagrange repo scope approve <request_id> --reason "needed for the CLI entrypoint"
open-lagrange repo resume <plan_id>
```

Each request is stored with a canonical digest. Approval is valid only for that exact request content. If requested files, capabilities, commands, risk, reason, evidence refs, or the node binding change, the old approval is stale and resume refuses to continue.

On approval, resume loads the immutable execution Planfile, verifies the worktree session, updates node scope, re-collects evidence for the newly approved scope through repository capabilities, regenerates the WorkOrder, and reruns PatchPlan or RepairPatchPlan generation. Patch validation, application, verification, repair, review, and final patch export remain owned by the control plane.

Rejected requests mark the node yielded and preserve status so the user can revise the Planfile or stop. Scope is never expanded automatically.
