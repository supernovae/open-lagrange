# Evidence-Only Patching

Evidence-only patching keeps model context narrow. The model can use only EvidenceBundle excerpts, relevant findings, WorkOrder constraints, and the required PatchPlan schema.

## Prompt Rules

The prompt states that the model:

- cannot read files
- cannot execute commands
- must use only provided evidence
- must not invent files, symbols, APIs, or test results
- must modify only allowed files
- must treat denied files as forbidden
- must request scope expansion when more context is needed
- should prefer small anchor-based edits or unified diffs
- may use full replacement only when policy permits it

## Operation Validation

Supported operation kinds are `insert_after`, `insert_before`, `replace_range`, `create_file`, `unified_diff`, and `full_replacement`.

Anchor operations require unique anchors unless policy explicitly permits ambiguity. Modify operations require expected hashes. Full replacement is bounded by policy and file size.

PatchPlans that touch denied or unallowed files are rejected unless they are represented as a scope expansion request and approved before retry.
