# Security TODO

This tracks security findings that were intentionally deferred because they require broader architectural work than a localized hardening patch.

## Web Build Trace Scope

- Finding: the Next route import chain for `apps/web/app/api/runs/[runId]/stream/route.ts` pulls runtime snapshot code from `@open-lagrange/core/runs`, which can make the web server output trace more of the project than intended.
- Risk: larger deployments and a higher chance of unintended server files being included in traced output.
- Follow-up: split runtime-safe run snapshot/event APIs from filesystem-heavy artifact viewers, or route web server calls through a narrow server-only adapter with explicit artifact/index roots.
- Acceptance: `next build` no longer warns that the route traces the whole project, and run stream behavior remains unchanged.

## TypeScript Guardrails

- Finding: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, and `noFallthroughCasesInSwitch` are enabled, but unused-code compiler checks still need rollout across all workspaces.
- Follow-up: evaluate `noUnusedLocals` and `noUnusedParameters` after existing intentional exports, command handlers, and test helper signatures are reviewed.
- Acceptance: root `npm run typecheck` passes with each added guardrail.
