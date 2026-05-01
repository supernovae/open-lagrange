# Research Fixtures

Research fixtures live in `examples/research-fixtures/` and exist for tests,
demos, evals, and explicit user demo runs.

```bash
open-lagrange research search "planning primitive" --fixture
open-lagrange research brief "MCP security risks" --fixture
open-lagrange research fetch https://example.invalid/open-lagrange/planning-primitive --fixture
```

Fixture output must be visibly labeled:

```json
{
  "source_mode": "fixture",
  "execution_mode": "fixture",
  "fixture_set": "research-brief-demo",
  "live": false
}
```

Fixture commands do not represent live web research. Use them for deterministic
demo behavior, repeatable tests, and offline validation of artifact lineage.
