# Repository Plan-to-Patch

Repository Plan-to-Patch turns a vague repository goal into durable typed artifacts and a final git patch. The model proposes typed work products; the control plane owns git worktrees, path policy, capability execution, patch validation, verification, repair bounds, artifact lineage, and final export.

## Commands

```bash
open-lagrange repo plan --repo . --goal "add json output to my cli" --dry-run
open-lagrange repo apply .open-lagrange/plans/<plan_id>.plan.md
open-lagrange repo status <plan_id>
open-lagrange repo patch <plan_id> --output final.patch
open-lagrange repo review <plan_id>
open-lagrange repo cleanup <plan_id>
```

`repo run --dry-run` is a convenience alias for creating and validating the Planfile. `repo run --apply` creates the Planfile and applies it through the same durable path.

## Flow

```text
developer goal
  -> GoalFrame
  -> Planfile DAG
  -> immutable execution copy
  -> isolated WorktreeSession
  -> WorkOrders
  -> EvidenceBundle
  -> PatchPlan
  -> validated PatchArtifact
  -> VerificationReport
  -> bounded RepairDecision
  -> ReviewReport
  -> final patch artifact
```

The CLI does not execute freeform Markdown. It parses and validates the executable Planfile block, computes the canonical digest, stores `.open-lagrange/runs/<plan_id>/plan.execution.json`, and then runs repository nodes through the repository PlanRunner.

## What Is Real

- Planfile generation writes `.open-lagrange/plans/<plan_id>.plan.md`.
- Repository apply creates `.open-lagrange/worktrees/<plan_id>/` on branch `ol/<plan_id>`.
- Evidence collection uses repository capabilities through PackRegistry and CapabilityStepRunner.
- Patch proposals are generated as schema-bound model PatchPlans from EvidenceBundle context, then validated before writes.
- Patch application mutates only the isolated worktree.
- Verification uses allowlisted executable plus args, not arbitrary shell strings.
- Final patch export validates the diff against the recorded base commit.
- Evidence, patch, verification, review, status, and final patch artifacts are recorded under `.open-lagrange/runs/<plan_id>/`.

## Still Experimental

The current implementation is intentionally narrow. Patch generation requires a configured model provider during apply, with explicit mock generation available for tests and demos. Repair records bounded decisions and scope expansion requests. Parallel DAG execution, broad semantic code editing, and remote distributed repository execution are not part of this phase.
