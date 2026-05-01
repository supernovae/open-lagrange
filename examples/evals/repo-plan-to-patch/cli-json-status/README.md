# CLI JSON Status Fixture

Tiny repository fixture for the Open Lagrange repository Plan-to-Patch golden path.

Goal:

```text
add --json output to my cli status command
```

Expected bounded change:

- Update `src/cli.ts`.
- Keep the existing text output working.
- Add a JSON output path for the status command.
- Keep `npm run typecheck` and `npm test` passing.

This fixture is copied into an isolated evaluation workspace before execution.
