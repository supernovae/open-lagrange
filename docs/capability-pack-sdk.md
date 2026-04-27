# Capability Pack SDK

Capability Packs are the extension unit for Open Lagrange. A pack declares a
manifest, typed capability descriptors, input and output schemas, and bounded
executors. The reconciler supplies policy, delegation, idempotency, status, and
approval context.

The SDK is runtime-neutral. It does not depend on Hatchet, Next.js, CLI code, or
Open-COT. Open Lagrange adapts SDK descriptors into Open-COT-compatible
capability snapshots.

## Pack Registry

Packs are registered explicitly in code for this phase. The registry rejects
duplicate pack IDs and duplicate capability IDs, finalizes stable capability
digests, filters capabilities for a task, and executes capabilities through a
single validation boundary.

Dynamic package loading is intentionally out of scope. A later design should
cover signing, trust policy, provenance, and isolated execution.

## Execution Contract

Every capability execution receives a Pack Context with delegation, project,
workspace, task, trace, idempotency, policy, and runtime configuration. The
context does not expose ambient filesystem, environment, shell, or network
authority.

Executors validate input before execution and output after execution. Zod checks
shape only; the policy gate remains the authorization layer.

