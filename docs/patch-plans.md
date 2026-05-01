# PatchPlans

A `PatchPlan` is a proposed edit. It is not the final patch and it is not allowed to mutate files by itself.

```ts
{
  patch_plan_id: string;
  plan_id: string;
  node_id: string;
  summary: string;
  rationale: string;
  evidence_refs: string[];
  operations: PatchOperation[];
  expected_changed_files: string[];
  verification_command_ids: string[];
  preconditions: PatchPrecondition[];
  risk_level: "read" | "write" | "destructive";
  approval_required: boolean;
  confidence?: number;
  requires_scope_expansion: boolean;
  scope_expansion_request?: ScopeExpansionRequest;
}
```

Supported operation kinds are `replace_range`, `insert_after`, `insert_before`, `create_file`, `unified_diff`, and `full_replacement`. Full replacement is limited to small files.

## Validation

`PatchValidator` enforces:

- repo-relative paths only
- path policy and denied path checks
- no `.git` or `.open-lagrange` internals
- no secret files
- expected hashes for modify operations
- expected changed file boundaries
- file size limits
- no broad delete behavior in this phase
- lockfile changes only with explicit preconditions
- unique anchors for anchor-based edits unless policy permits ambiguity
- approved scope expansion before touching files outside allowed evidence

Only a validated `PatchPlan` can be passed to the `PatchApplier`.

## PatchArtifact

The executor creates the `PatchArtifact` after applying a validated plan in the isolated worktree. It records changed files, unified diff, before and after hashes, apply status, structured errors, and artifact lineage.
