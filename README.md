# Open Lagrange

<p align="center">
  <img
    src="https://upload.wikimedia.org/wikipedia/commons/0/09/JWST-at-L2-Lagragian-Point.jpg"
    alt="NASA illustration of the James Webb Space Telescope near the Sun-Earth L2 Lagrange point"
    width="100%"
  />
</p>

<h3 align="center">The stable point between cognition and execution.</h3>

<p align="center">
  <a href="https://github.com/supernovae/open-lagrange/actions/workflows/ci.yml"><img src="https://github.com/supernovae/open-lagrange/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/supernovae/open-lagrange/actions/workflows/containers.yml"><img src="https://github.com/supernovae/open-lagrange/actions/workflows/containers.yml/badge.svg" alt="Containers" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue.svg" alt="TypeScript strict" /></a>
</p>

Open Lagrange is a TypeScript control plane for reconciled work. Models can
propose typed artifacts, but the platform owns durable state, policy,
capability boundaries, approvals, retries, resume, verification, telemetry, and
outputs.

It is built for workflows where “the model said so” is not enough.

## Core Model

Open Lagrange is organized around Durable Runs:

- **Planfiles** describe reviewable work as typed, validated plans.
- **Durable Runs** execute Planfiles and are the canonical visible execution surface.
- **RunEvents** record execution progress, approvals, artifacts, policy decisions, model calls, verification, repair, retry, resume, and completion.
- **RunSnapshots** are UI/query projections for CLI, TUI, and web.
- **Capability Packs** expose bounded operations through PackRegistry and CapabilityStepRunner.
- **Artifacts** are durable outputs, evidence, telemetry, and final exports.
- **Profiles and Providers** configure local or remote runtime access, model providers, search providers, secrets, and runtime services.

Hatchet owns durable workflow/task execution when available. Local projection
state exists for query and UI continuity; it is not the execution authority.

## What Works Now

- Compose, validate, reconcile, and apply Planfiles.
- Create Durable Runs from Planfiles and inspect them through CLI, TUI, or web.
- See active nodes, timelines, approvals, artifacts, model calls, policy decisions, errors, next actions, and final outputs.
- Resume yielded runs and retry failed nodes with an explicit replay mode.
- Apply repository Planfiles in isolated git worktrees, verify results, review output, and export final patches.
- Run research workflows through bounded search/fetch/extract/brief capabilities with artifact lineage.
- Validate, install, inspect, and health-check reviewed local Capability Packs.
- Store provider secrets through OS keychain references or environment-backed profiles.
- Operate local or remote runtime profiles through the CLI, TUI, Next.js API, and web Run Console.

## Quickstart

```bash
git clone git@github.com:supernovae/open-lagrange.git
cd open-lagrange
npm install
npm run build
```

The snippets below use the installed or linked `open-lagrange` binary. From a
source checkout, use `npm run cli -- <command>` as the local equivalent.

Bootstrap a local runtime profile, compose stack, Hatchet token, API, worker,
and web UI:

```bash
open-lagrange bootstrap --runtime podman
```

Docker works too:

```bash
open-lagrange bootstrap --runtime docker
```

Check runtime health:

```bash
open-lagrange status
open-lagrange doctor
```

Configure the local Control Plane bearer token before using the TUI or API:

```bash
TOKEN="$(openssl rand -hex 32)"
printf '%s' "$TOKEN" | open-lagrange auth login --from-stdin
open-lagrange restart --runtime podman
```

Configure provider credentials without writing secrets to project config:

```bash
open-lagrange secrets set openai
open-lagrange secrets status
```

## Run A Planfile

Run the included URL summary Planfile:

```bash
open-lagrange plan run examples/planfiles/research-url-summary.plan.md
```

Author a new Planfile and write it to `.open-lagrange/plans/`:

```bash
open-lagrange plan compose "Create a release readiness checklist for this repository" --write
```

Validate and inspect the Planfile:

```bash
open-lagrange plan check .open-lagrange/plans/<plan_id>.plan.md
open-lagrange plan explain .open-lagrange/plans/<plan_id>.plan.md
```

Save it for reuse:

```bash
open-lagrange plan save .open-lagrange/plans/<plan_id>.plan.md \
  --library workspace \
  --path research/release-readiness.plan.md
open-lagrange plan library list
open-lagrange plan library plans workspace
```

Create a Durable Run from the authored Planfile:

```bash
open-lagrange plan run .open-lagrange/plans/<plan_id>.plan.md
```

The command returns a `run_id`. Use that ID as the primary handle for status,
events, artifacts, approvals, model calls, retries, resume, and export.

```bash
open-lagrange run status <run_id>
open-lagrange run explain <run_id>
open-lagrange run events <run_id>
open-lagrange run artifacts <run_id>
```

If a run yields, the snapshot includes required next actions:

```bash
open-lagrange run resume <run_id>
open-lagrange run retry <run_id> <node_id> --mode reuse-artifacts
open-lagrange run retry <run_id> <node_id> --mode refresh-artifacts
open-lagrange run retry <run_id> <node_id> --mode force-new-idempotency-key
open-lagrange run cancel <run_id>
```

Retry always requires an explicit replay mode. Side-effecting work remains
behind policy and approval gates.

## Web Run Console

Start the web runtime with `bootstrap`, then open the Run Console:

```text
http://localhost:3000/runs/<run_id>
```

The web console shows:

- run status and active node
- step list
- timeline
- artifacts and artifact viewer
- approvals
- model calls
- logs and structured errors
- next actions
- Planfile projection

Plan Builder creates Durable Runs and navigates directly to `/runs/<run_id>`.
The web UI renders RunSnapshot and RunEvent projections; it does not execute
plan nodes directly.

Browse saved Planfiles in the web Plan Library:

```text
http://localhost:3000/plans
```

From there, Check, Run Now, Schedule, Save, and open the Run Console for the new run.

## Terminal Console

Open the terminal workbench:

```bash
open-lagrange tui
```

The TUI can open the same Durable Run state as the web console. It shows active
steps, timeline, artifacts, approvals, model calls, logs, and next actions.

Useful keys in Run Console mode:

- `a` approvals
- `f` artifacts
- `m` model calls
- `l` logs
- `p` plan
- `r` resume or retry
- `e` explain
- `q` back

## Repository Runs

Repository work compiles to a Planfile and executes as a Durable Run. Apply mode
uses an isolated git worktree, records evidence, generates a PatchPlan, applies
approved changes, verifies output, records model-call telemetry, and exports a
reviewable patch artifact.

```bash
open-lagrange repo run \
  --repo . \
  --goal "Add JSON output to the status command" \
  --apply \
  --planning-mode model
```

Inspect the resulting run:

```bash
open-lagrange run status <run_id>
open-lagrange run explain <run_id>
open-lagrange run artifacts <run_id>
```

Export the final patch artifact:

```bash
open-lagrange repo patch <plan_id> --output final.patch
```

Repository runs show phases such as planning, evidence collection, PatchPlan
generation, worktree application, verification, repair, review, and final patch
export.

## Research Runs

Research work also runs through Planfiles, Capability Packs, policy gates, and
artifact lineage.

```bash
open-lagrange research brief "MCP security risks"
open-lagrange run status <run_id>
open-lagrange run artifacts <run_id>
open-lagrange research export <artifact_id> --output brief.md
```

Research runs show phases such as search, source selection, source fetch,
content extraction, brief creation, citations, and Markdown export.

## Capability Packs

Capability Packs are the bounded execution surface. Packs declare capabilities,
schemas, risk, approval requirements, and runtime behavior.

Inspect installed packs:

```bash
open-lagrange pack list
open-lagrange pack inspect open-lagrange.repository
open-lagrange pack health open-lagrange.repository
```

Validate and install a reviewed local pack directory:

```bash
open-lagrange pack validate ./path/to/local-pack
open-lagrange pack install ./path/to/local-pack
open-lagrange restart
open-lagrange pack health <pack_id>
```

Installed workspace-local packs live under the active runtime profile unless
`--workspace-local` is specified.

## Architecture

The execution boundary is deliberate:

- Plan Builder creates or reconciles Planfiles.
- PlanRunner creates Durable Runs and emits RunEvents.
- CapabilityStepRunner executes PackRegistry capabilities behind policy gates.
- Approvals are explicit state transitions.
- Model calls produce telemetry artifacts.
- Verification and repair emit durable events.
- Hatchet owns workflow/task durability where available.
- RunEvent and RunSnapshot are projections for query, CLI, TUI, and web.

The control plane owns validation, policy, approvals, retries, resume,
artifacts, telemetry, and observability. Models produce typed artifacts; they
do not own runtime state.

## Packages

- `packages/core`: Planfiles, reconciliation, runs, policy, approvals,
  artifacts, packs, repository flows, research flows, and state stores.
- `packages/capability-sdk`: interfaces and primitives for bounded Capability Packs.
- `packages/runtime-manager`: profiles, local runtime supervision, doctor, and logs.
- `packages/platform-client`: fetch client for the Control Plane API.
- `apps/cli`: native command line entrypoint.
- `apps/tui`: Ink terminal Run Console and workbench.
- `apps/web`: Next.js Control Plane API and web Run Console.

## Core Docs

- [Durable Runs](docs/durable-runs.md)
- [Run Console](docs/run-console.md)
- [Run Events](docs/run-events.md)
- [Run Event Streaming](docs/run-event-streaming.md)
- [Run Watch](docs/run-watch.md)
- [Node Replay](docs/node-replay.md)
- [Web Run Console](docs/web-run-console.md)
- [TUI Run Console](docs/tui-run-console.md)
- [Planfiles](docs/planfiles.md)
- [Plan Check](docs/plan-check.md)
- [Plan Library](docs/plan-library.md)
- [Plan Builder to Run Console](docs/plan-builder-run-handoff.md)
- [Shareable Planfiles](docs/shareable-planfiles.md)
- [Plan Templates](docs/plan-templates.md)
- [Repository Plan-to-Patch](docs/repository-plan-to-patch.md)
- [Research Pack](docs/research-pack.md)
- [Artifacts](docs/artifacts.md)
- [Artifact lineage](docs/artifact-lineage.md)
- [Policy decision reports](docs/policy-decision-reports.md)
- [Pack security model](docs/pack-security-model.md)
- [Pack runtime activation](docs/pack-runtime-activation.md)
- [HTTP primitive](docs/http-primitive.md)
- [Primitive security model](docs/primitive-security-model.md)
- [Doctor](docs/doctor.md)

## Operator Notes

Durable Run is the visible execution surface. Prefer `run status`, `run explain`,
`run events`, and `run artifacts` for active work instead of domain-specific
status shortcuts. Domain commands are convenience entrypoints that should return
or lead to a `run_id`.

The local state under `.open-lagrange/` is projection and artifact state. Do not
treat it as workflow authority when Hatchet-backed runtime is available.

## Development

```bash
npm run typecheck
npm test
npm run build
```

Image: NASA illustration of JWST near L2, public domain via
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:JWST-at-L2-Lagragian-Point.jpg).
