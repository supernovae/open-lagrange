# Repository Planfile to Patch

Repository work now uses the generic Planning Primitive as its control-plane entry point. A developer goal becomes a Planfile, the Planfile compiles ready nodes into Work Orders, and repository-specific handlers produce evidence, structured patch plans, patch artifacts, verification reports, review reports, and a final git patch artifact.

The generic planner stays repository-neutral. Repository path policy, command policy, git worktree behavior, patch validation, and verification policy live in the Repository Task Pack layer.

## Flow

```text
developer goal
  -> GoalFrame
  -> Repository Planfile
  -> WorkOrders
  -> EvidenceBundle
  -> PatchPlan
  -> PatchArtifact
  -> VerificationReport
  -> bounded RepairWorkOrder
  -> ReviewReport
  -> final patch artifact
```

Use:

```bash
open-lagrange repo plan --repo . --goal "add json output to my cli" --dry-run
open-lagrange repo apply .open-lagrange/plans/<plan_id>.md
open-lagrange repo status <plan_id>
open-lagrange repo patch <plan_id> --output final.patch
```

`repo run` now defaults to the Planfile path and keeps the prior endpoint behind `--legacy`.

## Execution Rules

Patch nodes must reference acceptance criteria and consume an EvidenceBundle. PatchPlans declare expected changed files, include hash preconditions for existing files, and pass repository patch validation before any worktree mutation.

Verification nodes run only command IDs allowed by repository policy. Repair is bounded, records attempts as artifacts, and yields when scope expansion or stronger model routing is needed.

## Lower Model Support

Implementation work is scoped to a Work Order plus EvidenceBundle, relevant excerpts, constraints, latest failures, and an output schema. The model receives only the data needed for the current node, while the control plane keeps state, policy, approvals, verification, and artifacts.

## Reuse

Repository Task Pack proves the Planning Primitive can drive real work without becoming repository-specific. Future business, research, and Skill-to-Pack workflows can reuse the same Planfile and Work Order contracts while supplying their own handlers.
