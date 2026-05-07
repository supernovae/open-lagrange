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
propose typed artifacts, but the platform owns state, policy, capability
boundaries, approvals, verification, durable progress, and artifacts.

It is built for workflows where “the model said so” is not enough.

## Product Model

Open Lagrange is organized around five core objects:

- **Plans** are reusable, reviewable Planfiles.
- **Runs** are durable executions of a Planfile and the canonical visible execution surface.
- **Packs** provide validated capabilities.
- **Artifacts** are durable outputs and evidence.
- **Profiles/Providers** configure where work runs and which model/search services are available.

Research briefs, repository tasks, skills, scheduled jobs, demos, and evals all
compile to or run through Planfiles where possible. Domain commands remain as
shortcuts, but `plan compose`, `plan check`, `run`, `artifact`, `pack`, and
`provider` are the primary surfaces.

## What You Can Try Now

- **Planfiles**: turn a vague goal into a reviewable Markdown plan with typed YAML execution data.
- **Collaborative Plan Builder**: iteratively compose, simulate, validate, question, revise, and save stable Planfiles.
- **Run Console**: inspect timelines, active nodes, artifacts, approvals, model calls, errors, next actions, and outputs for a run.
- **Repository Task Pack**: inspect a repo, collect evidence, create patch plans, apply changes in an isolated worktree, verify, review, and export a final patch.
- **Workflow Skill Builder**: bring a `skills.md` file, frame it, match it to existing packs, and generate a Planfile-backed Workflow Skill.
- **Generated Capability Packs**: when existing packs are insufficient, generate a reviewable local pack scaffold and validation report.
- **Secrets**: store local credentials as OS keychain references instead of plaintext config.
- **CLI/TUI/API**: use the native CLI, Ink TUI, or local Control Plane API.

Start with the friendly walkthrough: [docs/ELI5_start.md](docs/ELI5_start.md).

Fastest dry-run demo:

```bash
open-lagrange demo run repo-json-output --dry-run
```

That command writes a Planfile, patch plan, patch artifact preview, verification
report, review report, and timeline under `.open-lagrange/demos/`, then indexes
them by run. Start with `run outputs latest`; use `artifact show` only when you
want a specific durable artifact.

## Quickstart

```bash
git clone git@github.com:supernovae/open-lagrange.git
cd open-lagrange
npm install
npm run build
```

The snippets below use the installed or linked `open-lagrange` binary. When
working from a source checkout without that binary on `PATH`, use
`npm run cli -- <command>` as the local equivalent.

Bootstrap the local runtime profile, compose stack, Hatchet token, API, worker,
and web UI in one command:

```bash
open-lagrange bootstrap --runtime podman
```

Docker works too:

```bash
open-lagrange bootstrap --runtime docker
```

Check health:

```bash
open-lagrange status
open-lagrange doctor
```

`init` and `up` still exist for scripting, but `bootstrap` is the smooth local
path. It creates or reuses the managed `local` profile, writes
`~/.open-lagrange/docker-compose.yaml`, lets the compose stack create the
Hatchet client token in its config volume, and reports readiness steps.

Configure the local Control Plane bearer token before using the TUI or any
`/v1` API-backed commands:

```bash
TOKEN="$(openssl rand -hex 32)"
printf '%s' "$TOKEN" | open-lagrange auth login --from-stdin
open-lagrange restart --runtime podman
```

## Demos And Experiments

Run the repository Plan-to-Patch demo:

```bash
open-lagrange demo run repo-json-output --dry-run
open-lagrange run outputs latest
open-lagrange artifact recent
```

Run the same demo through a live isolated fixture repo and git worktree:

```bash
open-lagrange demo run repo-json-output --live
open-lagrange run outputs latest
```

Run the Research Brief Workflow Skill demo:

```bash
open-lagrange demo run skills-research-brief --dry-run
open-lagrange run outputs latest
```

Try the Research Pack offline with fixture sources:

```bash
open-lagrange research search "planning primitive" --fixture
open-lagrange research brief "MCP security risks" --fixture
```

Fetch one explicit live URL through SDK HTTP policy:

```bash
open-lagrange research fetch https://example.com --live
```

Run the first live Planfile workflow end to end:

```bash
open-lagrange plan apply examples/planfiles/research-url-summary.plan.md --live
open-lagrange artifact list
```

This executes locally through PlanRunner, PackRegistry, CapabilityStepRunner,
the Research Pack, SDK HTTP policy, and the artifact index. The URL fetch,
source snapshot, extraction, Markdown export, and lineage are real. Live search,
remote distributed execution, browser automation, JavaScript execution, OAuth,
and model-generated briefs are still out of scope for this path.

Inspect runtime and packs:

```bash
open-lagrange doctor
open-lagrange pack list
open-lagrange pack inspect open-lagrange.repository
```

The current demos use deterministic fixtures. The repository dry-run previews
the patch pipeline without mutating the tracked fixture. The repository live
mode copies the fixture into `.open-lagrange/demos/`, creates a local git
worktree, executes the PlanRunner through repository handlers, verifies the
change, and exports a real final patch artifact. The research demo uses
checked-in source notes rather than live network search.

Create a generic Planfile:

```bash
open-lagrange plan create --goal "Draft a safe rollout checklist" --dry-run
```

Plan a repository change without touching your working tree:

```bash
open-lagrange repo doctor --repo examples/evals/repo-plan-to-patch/cli-json-status
open-lagrange repo plan \
  --repo examples/evals/repo-plan-to-patch/cli-json-status \
  --goal "add --json output to my cli status command" \
  --dry-run \
  --planning-mode deterministic
```

Apply the generated repository Planfile in an isolated git worktree and export a validated patch:

```bash
open-lagrange repo apply .open-lagrange/plans/<plan_id>.plan.md
open-lagrange repo status <plan_id>
open-lagrange repo model-calls <plan_id>
open-lagrange artifact list --plan <plan_id>
open-lagrange repo explain <plan_id>
open-lagrange repo patch <plan_id> --output final.patch
open-lagrange repo cleanup <plan_id>
```

The canonical fixture lives at `examples/evals/repo-plan-to-patch/cli-json-status`.
It contains a tiny status command, README, package scripts, and a simple
verification path.

This path is real local runtime execution. The Planfile is validated,
repository capabilities are invoked through PackRegistry and
CapabilityStepRunner, evidence is recorded, PatchPlans are generated from
bounded evidence, model-call telemetry is stored as redacted indexed artifacts,
file writes happen only in `.open-lagrange/worktrees/<plan_id>/`, verification
commands are allowlisted, and the final patch is exported as a reviewable
artifact against the original base commit. `repo status`, `repo explain`,
`repo model-calls`, and `artifact list --plan` expose the artifact trail.

Current limits: deterministic planning is the default preview path, model-backed
PatchPlan generation requires configured provider credentials, repair remains
bounded, no arbitrary shell commands are executed, and the model never mutates
files directly. If execution yields, status includes a reason, remediation, and
suggested next command.

Prune old local artifacts without touching source files:

```bash
open-lagrange artifact prune --older-than 7d
```

If a PatchPlan requests more scope, approve or reject the exact request and resume:

```bash
open-lagrange repo scope approve <request_id> --reason "needed for the requested file"
open-lagrange repo resume <plan_id>
```

Run the model routing benchmark with deterministic fixture outputs:

```bash
open-lagrange eval list
open-lagrange eval routes
open-lagrange eval run repo-plan-to-patch --mock-models
open-lagrange eval report <run_id>
```

Run provider-backed evals explicitly:

```bash
open-lagrange eval run repo-plan-to-patch --live-models --planning-mode model --yes --max-scenarios 1
```

Live evals measure planner, implementer, repair, and reviewer route roles. Reports include per-role calls, token counts, and estimated or provider-reported cost.

Build a Workflow Skill from ordinary Markdown:

```bash
open-lagrange skill plan ./skills.md
```

Generate a reviewable Capability Pack scaffold from a skill:

```bash
open-lagrange pack build examples/skills/http-json-fetcher.md --dry-run
open-lagrange pack inspect .open-lagrange/generated-packs/local.http-json-fetcher
open-lagrange pack validate .open-lagrange/generated-packs/local.http-json-fetcher
```

Try the generated pack lifecycle end to end with a safe Markdown Transformer:

```bash
open-lagrange pack build examples/skills-markdown-transformer/skills.md --dry-run
open-lagrange pack validate .open-lagrange/generated-packs/local.markdown-transformer
open-lagrange pack install .open-lagrange/generated-packs/local.markdown-transformer
open-lagrange restart
open-lagrange pack health local.markdown-transformer
open-lagrange pack smoke local.markdown-transformer
```

Install writes to the active runtime profile by default:
`~/.open-lagrange/profiles/<profile>/packs/`. Use `--workspace-local` when you
want a disposable workspace registry instead.

Configure a provider key without writing it to config:

```bash
open-lagrange secrets set openai
open-lagrange secrets status
```

Open the terminal cockpit:

```bash
open-lagrange tui
```

The TUI now opens to Home, a chat-guided cockpit. You can type natural language
and review the suggested flow before anything starts:

```text
what can you do?
add json output to my cli
build a pack from skills.md
run the repo demo
why did this need approval?
```

Workflow-starting chat shows the equivalent slash command and requires
`/confirm`. Slash commands remain first-class:

```text
/status
/doctor
/capabilities
/plan repo "add json output to my cli"
/pack build ./skills.md
/demo run repo-json-output
```

## Current Capabilities

Open Lagrange currently includes:

- Planning Primitive and Planfiles
- Capability Pack SDK and PackRegistry
- SDK runtime primitives for bounded HTTP, artifacts, retry, rate limits, redaction, secrets, approval, and policy checks
- Repository Task Pack with isolated worktree execution
- Research Pack with fixture search, bounded live URL fetch, extraction, source sets, citations, and research brief artifacts
- patch plans, patch artifacts, verification reports, and review reports
- bounded repair attempt tracking
- SecretProvider abstraction with OS keychain and env fallback
- runtime profiles for local and remote control-plane use
- CLI, TUI, and Next.js API surfaces
- Workflow Skill Builder Phase 1
- Generated Capability Packs Phase 2 with scaffold, static safety checks, compile/test validation, and explicit install
- runtime activation for installed local packs, pack health, smoke tests, artifact lineage, and policy decision reports
- TUI Home with Chat Pack guided discovery and typed User Frame Events
- Golden Path demos, artifact index, doctor checks, and pack inspection

## How It Thinks About Work

Open Lagrange separates the loop:

- models emit typed planning and execution artifacts
- validators check shape and policy
- Capability Packs expose bounded operations
- approvals gate risky work
- runners persist progress and artifacts
- verification and review explain what happened

That separation is the point: cognition can be useful without becoming the
runtime, authority, or owner of the work.

## Packages

- `packages/core`: planning, reconciliation, workflows, policy, approval,
  status, secrets, skills, and trusted local packs.
- `packages/capability-sdk`: interfaces for building bounded Capability Packs.
- `packages/runtime-manager`: profiles, local runtime supervision, doctor, and logs.
- `packages/platform-client`: fetch client for the Control Plane API.
- `apps/cli`: native command line entrypoint.
- `apps/tui`: Ink terminal cockpit.
- `apps/web`: Next.js Control Plane API and lightweight web UI.

## More Docs

- [Golden Path demos](docs/golden-path-demos.md)
- [Artifacts](docs/artifacts.md)
- [Runs](docs/runs.md)
- [Run Console](docs/run-console.md)
- [Run Events](docs/run-events.md)
- [Web Run Console](docs/web-run-console.md)
- [TUI Run Console](docs/tui-run-console.md)
- [Doctor](docs/doctor.md)
- [Pack inspection](docs/pack-inspection.md)
- [Planfiles](docs/planfiles.md)
- [Skills-to-Pack](docs/skills-to-pack.md)
- [Skills-to-Pack Phase 2](docs/skills-to-pack-phase-2.md)
- [Generated Capability Packs](docs/generated-capability-packs.md)
- [Pack validation](docs/pack-validation.md)
- [Pack security model](docs/pack-security-model.md)
- [Pack runtime activation](docs/pack-runtime-activation.md)
- [Pack health](docs/pack-health.md)
- [Pack smoke tests](docs/pack-smoke-tests.md)
- [SDK primitives](docs/sdk-primitives.md)
- [HTTP primitive](docs/http-primitive.md)
- [Primitive security model](docs/primitive-security-model.md)
- [Research Pack](docs/research-pack.md)
- [Source artifacts](docs/source-artifacts.md)
- [Citations](docs/citations.md)
- [Research workflows](docs/research-workflows.md)
- [Artifact lineage](docs/artifact-lineage.md)
- [Policy decision reports](docs/policy-decision-reports.md)
- [TUI Home](docs/tui-home.md)
- [Chat Pack](docs/chat-pack.md)
- [User Frame Events](docs/user-frame-events.md)

## Roadmap

The next phase is isolated validation execution for generated pack source, then
controlled reload after install. Hot reload stays behind explicit trust and
validation gates.

## Development

```bash
npm run typecheck
npm test
npm run build
```

Image: NASA illustration of JWST near L2, public domain via
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:JWST-at-L2-Lagragian-Point.jpg).
