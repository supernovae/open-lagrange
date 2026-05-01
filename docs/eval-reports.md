# Eval Reports

Eval reports are written under:

```text
.open-lagrange/evals/<eval_run_id>/
  metrics.json
  report.md
  report.csv
  patches/
```

The Markdown report includes route summary tables, scenario-level rows, success rate, average tokens, average estimated cost, repair attempts, validation failures, verification pass rate, changed files, and recommended defaults.

Metrics expose validation failures and verification failures directly. Provider output is never treated as trusted; PatchPlans still pass through deterministic validation and worktree-only application.
