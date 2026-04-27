# Architecture

Open Lagrange treats the model as a non-deterministic cognitive function. The
model produces typed artifacts only. The reconciler owns validation,
authorization, policy evaluation, endpoint execution, observations, and final
status.

Hatchet owns durable workflow and task execution for this implementation. Model
calls, capability discovery, endpoint calls, critic checks, approval records,
and status writes are isolated as Hatchet-managed tasks with typed input,
typed output, idempotency metadata, retry policy, and schema validation.

Capability snapshots and digests bind execution intents to the exact endpoint
surface that was injected into the cognitive step. The model cannot invent a
new endpoint and have it execute, because every intent is reconciled against
the frozen snapshot before policy evaluation.

Zod validation is not authorization. Zod validates object shape. The policy
gate evaluates DelegationContext, scopes, denied scopes, risk, approval rules,
idempotency, and execution budgets.

DelegationContext is carried into every endpoint execution request so endpoint
calls never rely on ambient user authority. Approval continuation also reuses
the original DelegationContext; approval permits one stored intent to proceed
and does not create new authority.

Approval continuation is a two-phase flow:

1. A task reaches `requires_approval`, records an approval request, and stores a
   continuation context containing the validated intent and capability snapshot.
2. Approval records a decision and starts a deterministic continuation workflow
   run that revalidates the stored context before endpoint execution.

Portable runtime interfaces remain implementation-neutral. Hatchet workflow
names, run IDs, worker names, retry policy, Next.js routes, SQLite, MCP mocks,
and Vercel AI SDK wrappers stay in Open Lagrange.
