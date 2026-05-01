# Test Harness

Tests should use explicit fixture, mock, or test modes. They should not require
live internet.

Recommended patterns:

- Use `--fixture` or `mode: "fixture"` for deterministic Research Pack demos.
- Use SDK primitive substitutes, such as a controlled HTTP implementation, for
  live capability unit tests.
- Use `dry_run` for validation-only paths that must not perform network or file
  side effects.
- Assert artifact `source_mode` and `execution_mode` for live, fixture, dry-run,
  mock, and test outputs.

Normal apply paths should reject fixture nodes unless an explicit demo/eval
context allows fixtures. Mock nodes are valid only in test context.
