# Pack Smoke Tests

Smoke tests prove that an installed pack can be discovered, policy-checked, and invoked through the runtime path without using raw secrets or direct generated source loading.

```sh
open-lagrange pack smoke local.markdown-transformer
```

The smoke path:

1. Loads installed pack metadata.
2. Validates manifest-backed descriptors.
3. Selects a dry-run-safe read capability.
4. Emits a policy decision report.
5. Executes through `PackRegistry`.
6. Writes a `pack_smoke_report` artifact.

Smoke tests skip packs that expose no dry-run-safe read capability.
