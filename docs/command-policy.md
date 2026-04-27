# Command Policy

The Repository Task Pack does not expose arbitrary shell execution.

Verification commands must be exact allowlist entries or fixed structured
commands from repository policy. Commands run with `shell: false`, timeout, and
output limits.

Rejected syntax includes:

- pipes
- redirects
- command substitution
- environment assignment
- glob shell expansion
- semicolon chaining

Default command IDs include:

- `npm_test`
- `npm_run_test`
- `npm_run_lint`
- `npm_run_typecheck`
- `pnpm_test`
- `pnpm_lint`
- `pnpm_typecheck`
- `git_diff_stat`
- `git_diff`
- `git_status_short`
