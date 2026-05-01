# Repository Evals

Repository eval scenarios live under `examples/evals/repo-plan-to-patch/`. Each scenario defines:

- initial fixture files
- a repository goal
- expected changed files
- allowlisted verification command IDs
- success criteria

The harness writes reports under `.open-lagrange/evals/<run_id>/`:

- `metrics.json`
- `report.md`
- `metrics.csv`

Benchmark runs use isolated fixture content and must not mutate a user repository. Mock mode estimates token usage when provider metadata is unavailable. Live mode records provider usage when available, estimates tokens when needed, and is never selected by default.
