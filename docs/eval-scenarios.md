# Eval Scenarios

Repository eval scenarios live under `examples/evals/repo-plan-to-patch/`.

Each scenario defines:

- `scenario_id`
- title and description
- fixture repository path or inline fixture files
- goal
- expected and forbidden changed files
- allowlisted verification command IDs
- success criteria for patch apply, verification, changed files, and output patterns

Current scenarios:

- `cli-json-status`
- `readme-usage-example`
- `fix-failing-test`
- `typecheck-error-fix`
- `config-flag`

Fixture sources are never mutated directly. The runner copies them into isolated eval workspaces before repository execution.
