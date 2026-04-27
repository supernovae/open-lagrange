# Open Lagrange

Open Lagrange is an opinionated TypeScript cognitive execution framework. It is
a deterministic reconciliation framework around non-deterministic cognitive
functions.

The cognitive step emits typed artifacts. The TypeScript runtime validates,
authorizes, reconciles, and executes only through configured endpoint
capabilities. MCP is the first local endpoint binding in this implementation.

Open-COT is the reusable interface layer. Open Lagrange is the working
implementation that pressure-tests Open-COT against durable workflow runs,
capability injection, policy gates, MCP side effects, error handling,
delegation, yield, approval placeholders, and reconciliation.

## Runtime Pivot

The first slice used a source-available runtime. This project now uses Hatchet
as the durable workflow/task substrate because Hatchet is MIT licensed and
fits the OSS foundation requirement.

Hatchet does not provide the same replay-journal semantics as the prior
runtime. Open Lagrange now isolates non-deterministic and side-effecting work
as Hatchet-managed tasks with deterministic input, idempotency metadata, retry
policy, persisted run history, and schema validation. Model output is
untrusted and must be reconciled before any side effect occurs.

## Workspace Layout

- `packages/core`: schemas, deterministic IDs, tasks, policy, MCP mocks,
  Hatchet workflow runs, status state, and worker setup.
- `apps/cli`: Commander CLI for submitting and polling project workflow runs.

## Local Commands

```bash
npm install
npm run typecheck
npm test
npm run build
```

Start the worker:

```bash
npm run dev:worker
```

Run the CLI demo:

```bash
npm run cli -- run-demo
```

## CLI

```bash
npm run cli -- submit "Create a short README summary for this repository."
npm run cli -- status <project-id-or-run-id>
npm run cli -- run-demo
```

## Open-COT Relationship

Open-COT is the portable schema and RFC layer. Open Lagrange is the
opinionated TypeScript implementation that pressure-tests those schemas under
durable execution, MCP side effects, policy gates, and reconciliation.

Portable schema gaps found here are tracked in `open-cot-alignment.md` and
must become Open-COT PRs when they are reusable core or extension concepts.
