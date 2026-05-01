# Model PatchPlans

Repository apply now asks a configured model provider for a schema-bound PatchPlan. The model receives bounded evidence and emits a typed artifact only. It does not mutate files, run commands, inspect the repository, or receive the full repository tree.

## Inputs

PatchPlan generation receives:

- WorkOrder
- EvidenceBundle excerpts and findings
- acceptance criteria and non-goals
- constraints
- allowed and denied files
- patch policy
- latest verification failures in repair mode
- current diff summary in repair mode

The prompt excludes raw secrets, hidden config, unrelated transcripts, full repository contents, and long command logs.

## Output

The output must parse as a PatchPlan. Freeform prose, Markdown-only patches, and unstructured diffs are rejected. PatchPlans include confidence, evidence refs, expected changed files, preconditions, operations, and whether scope expansion is required.

If no model provider is configured during authoritative apply, the patch node yields with `MODEL_PROVIDER_UNAVAILABLE`. Tests and demos can inject an explicit mock generator.

## Execution Boundary

The Control Plane validates evidence refs, path policy, file hashes, anchors, allowed files, operation limits, and approval requirements before any worktree write. The final PatchArtifact is produced by the executor, not by the model.
