# Open Lagrange

Open Lagrange is an opinionated TypeScript cognitive execution framework. It is
a deterministic reconciliation framework around non-deterministic cognitive
functions.

The model emits typed cognitive artifacts. The reconciler validates,
authorizes, reconciles, and executes only through injected endpoint
capabilities. Zod validation checks shape; the policy gate authorizes action.

Open-COT is the reusable interface layer. Open Lagrange is the working
implementation that pressure-tests Open-COT against durable workflow runs,
capability injection, policy gates, MCP side effects, delegation, approval
continuation, critic checks, yield, and reconciliation.
The Repository Task Pack adds repo-scoped file inspection, validated patch
planning, allowlisted verification, diff capture, and PR-ready review reports.
Capability Packs are now the extension unit: trusted local modules declare
typed descriptors, stable digests, schemas, and bounded executors that run
through the Pack Registry.

## Workspace Layout

- `packages/core`: schemas, deterministic IDs, Hatchet tasks/workflows, policy,
  MCP mocks, SQLite state, approval continuation, and shared workflow clients.
- `packages/capability-sdk`: runtime-neutral Capability Pack interfaces,
  registry, digesting, execution result shape, and Open-COT adapters.
- `apps/cli`: Commander CLI for submitting, polling, approving, and rejecting.
- `apps/web`: Next.js App Router UI and API interface.

## Local Commands

```bash
npm install
npm run typecheck
npm test
npm run build
```

Start Hatchet, the worker, and the web UI:

```bash
hatchet server start
npm run dev:worker
npm run dev:web
```

Run the CLI demo:

```bash
npm run cli -- run-demo
```

Run the Repository Task Pack demo in dry-run mode:

```bash
npm run cli -- repo run \
  --repo . \
  --goal "Add a short Repository Task Pack note to the README."
```

Apply mode is explicit:

```bash
npm run cli -- repo run \
  --repo . \
  --goal "Add a short Repository Task Pack note to the README." \
  --apply
```

Submit through the web API:

```bash
curl -s http://localhost:3000/api/jobs \
  -H 'content-type: application/json' \
  -d '{"goal":"Create a short README summary for this repository."}'
```

Submit a repository task through the web API:

```bash
curl -s http://localhost:3000/api/repository/jobs \
  -H 'content-type: application/json' \
  -d '{"goal":"Add a short Repository Task Pack note to the README.","repo_root":".","dry_run":true}'
```

## Approval

Tasks that require approval stop with `requires_approval`. Approval records a
decision and starts a deterministic continuation workflow run that executes only
the previously validated intent. Approval does not mutate arguments, capability
digests, risk level, or delegated authority.

```bash
npm run cli -- approve <task-run-id> --reason "Approved for demo"
npm run cli -- reject <task-run-id> --reason "Rejected for demo"
```

## Open-COT Relationship

Open-COT carries portable schemas and RFCs. Hatchet, Next.js, the Vercel AI SDK
wrapper, SQLite, and the mock MCP registry are Open Lagrange implementation
details. Portable schema gaps found here are tracked in `open-cot-alignment.md`
and should become Open-COT PRs when they are reusable core or extension
concepts.

Capability Pack metadata, descriptors, side effect kinds, idempotency modes, and
execution results are tracked as Open-COT candidates. The local Pack Registry
and static loading policy remain Open Lagrange implementation details.
