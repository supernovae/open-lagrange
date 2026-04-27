# Open Lagrange

Open Lagrange is a durable reconciliation framework around non-deterministic
cognitive functions.

The cognitive step emits a typed artifact. The TypeScript runtime validates,
authorizes, reconciles, and executes only through configured MCP endpoints.

## Current PoC

- Restate workflow registration in `src/workflows/reconciler.ts`
- Zod runtime schemas for Open CoT-compatible artifacts
- Trusted mocked MCP endpoint registry
- Policy gate separated from schema validation
- Bounded single-step reconciliation
- Structured observations and reconciliation errors

## Local Checks

```bash
npm run typecheck
npm test
npm run build
```

## Open CoT Relationship

Open CoT is the portable schema and RFC layer. Open Lagrange is the
opinionated TypeScript implementation that pressure-tests those schemas under
durable execution, MCP side effects, policy gates, and reconciliation.

Portable schema gaps found here are tracked in `open-cot-alignment.md` and
should become Open CoT PRs.
