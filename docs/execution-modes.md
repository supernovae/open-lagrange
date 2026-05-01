# Execution Modes

Open Lagrange uses a shared execution mode vocabulary across runtime steps,
Planfiles, Research Pack commands, and artifacts.

## Live

`live` is the default user-facing mode. Real capability execution is allowed
when PackRegistry resolution, schema validation, policy gates, credentials, and
runtime limits allow it. Network, file, or API operations may run only through
registered capabilities and SDK primitives.

## Dry Run

`dry_run` validates and previews execution. It checks plan shape, capability
availability, input schemas, policy, output paths, and required configuration.
It does not fetch network content or create fake completed source artifacts.
Preview artifacts must be labeled as dry-run previews.

## Fixture

`fixture` uses deterministic checked-in sources. It is allowed only when
explicitly requested by tests, evals, demos, or user flags such as `--fixture`.
Artifacts must include `source_mode: fixture`, `execution_mode: fixture`, and a
warning that the output is not live web research.

## Mock

`mock` uses substituted capability or model behavior and is limited to
test/development harnesses. Artifacts must include `source_mode: mock` and
`execution_mode: mock`.

## Test

`test` is reserved for unit and integration tests. It can use controlled
runtime substitutes without requiring live internet.
