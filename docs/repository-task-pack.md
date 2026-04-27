# Repository Task Pack

The Repository Task Pack is the first real Open Lagrange capability pack. It
lets a repo-scoped workflow inspect allowed files, create a Patch Plan, validate
the plan, apply approved changes, run allowlisted verification, and produce a
Review Report.

The pack is trusted local code. It exposes MCP-shaped capability descriptors,
but it does not start arbitrary MCP stdio commands and it does not expose a
general shell.

Capabilities:

- `repo.list_files`
- `repo.read_file`
- `repo.search_text`
- `repo.propose_patch`
- `repo.apply_patch`
- `repo.run_verification`
- `repo.get_diff`
- `repo.create_review_report`

Dry-run is the default. Dry-run tasks stop before applying patches and create an
approval continuation envelope with the exact patch plan, workspace policy, and
verification command IDs.

When approved, Open Lagrange starts a deterministic repository continuation
workflow run that applies only the previously validated patch plan. Approval
does not grant authority to change files, commands, risk level, or arguments.

Apply mode is explicit and still passes through path policy, expected hash
checks, byte limits, and command policy.
