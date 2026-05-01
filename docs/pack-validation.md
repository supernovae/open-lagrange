# Pack Validation

`open-lagrange pack validate` accepts either a registered pack ID or a generated
pack path.

```bash
open-lagrange pack validate open-lagrange.repository
open-lagrange pack validate .open-lagrange/generated-packs/local.http-json-fetcher
```

Generated pack validation checks:

- `open-lagrange.pack.yaml` exists and has required metadata.
- Every capability declares input and output schemas.
- Risky capabilities require approval.
- `artifacts/build-plan.json` validates as a `PackBuildPlan`.
- TypeScript source avoids blocked unsafe patterns.
- TypeScript compiles.
- Generated tests run.

Validation status:

- `pass`: pack may be installed explicitly.
- `requires_manual_review`: install is refused by default.
- `fail`: install is blocked.

The validator is intentionally conservative. It catches obvious unsafe source
patterns and records manual review items instead of trusting generated code.

