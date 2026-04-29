# Patch Plans and Patch Artifacts

A PatchPlan is a proposed structured change. A PatchArtifact is the observed result after a validated PatchPlan is applied in an isolated worktree.

## PatchPlan

PatchPlans include:

- summary and rationale
- evidence references
- operations
- expected changed files
- verification command IDs
- preconditions
- risk level
- approval requirement

Modify and delete operations require expected file hashes when available. Full replacement is allowed only for small files within repository policy limits. Broad deletes, denied paths, secret-looking paths, and unrelated lockfile changes are rejected unless policy allows them.

## PatchArtifact

PatchArtifacts include:

- changed files
- unified diff
- before and after hashes when available
- apply status
- errors
- creation time

Verification consumes PatchArtifacts. Review consumes PatchArtifacts plus VerificationReports. Finalization exports a git patch artifact from the worktree diff.

## Why Both Exist

PatchPlans are intent. PatchArtifacts are execution evidence. Keeping both lets reviewers compare what was proposed, what was applied, what was verified, and what will be exported.
