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

## What You Can Try Now

- **Planfiles**: turn a vague goal into a reviewable Markdown plan with typed YAML execution data.
- **Repository Task Pack**: inspect a repo, collect evidence, create patch plans, apply changes in an isolated worktree, verify, review, and export a final patch.
- **Workflow Skill Builder**: bring a `skills.md` file, frame it, match it to existing packs, and generate a Planfile-backed Workflow Skill.
- **Generated Capability Packs**: when existing packs are insufficient, generate a reviewable local pack scaffold and validation report.
- **Secrets**: store local credentials as OS keychain references instead of plaintext config.
- **CLI/TUI/API**: use the native CLI, Ink TUI, or local Control Plane API.

Start with the friendly walkthrough: [docs/ELI5_start.md](docs/ELI5_start.md).

Fastest dry-run demo:

```bash
npm run cli -- demo run repo-json-output --dry-run
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

Bootstrap the local runtime profile, compose stack, Hatchet token, API, worker,
and web UI in one command:

```bash
npm run cli -- bootstrap --runtime podman
```

Docker works too:

```bash
npm run cli -- bootstrap --runtime docker
```

Check health:

```bash
npm run cli -- status
npm run cli -- doctor
```

`init` and `up` still exist for scripting, but `bootstrap` is the smooth local
path. It creates or reuses the managed `local` profile, writes
`~/.open-lagrange/docker-compose.yaml`, lets the compose stack create the
Hatchet client token in its config volume, and reports readiness steps.

## Demos And Experiments

Run the repository Plan-to-Patch demo:

```bash
npm run cli -- demo run repo-json-output --dry-run
npm run cli -- run outputs latest
npm run cli -- artifact recent
```

Run the same demo through a live isolated fixture repo and git worktree:

```bash
npm run cli -- demo run repo-json-output --live
npm run cli -- run outputs latest
```

Run the Research Brief Workflow Skill demo:

```bash
npm run cli -- demo run skills-research-brief --dry-run
npm run cli -- run outputs latest
```

Try the Research Pack offline with fixture sources:

```bash
npm run cli -- research search "planning primitive" --fixture
npm run cli -- research brief "MCP security risks" --fixture
```

Fetch one explicit live URL through SDK HTTP policy:

```bash
npm run cli -- research fetch https://example.com --live
```

Run the first live Planfile workflow end to end:

```bash
npm run cli -- plan apply examples/planfiles/research-url-summary.plan.md --live
npm run cli -- artifact list
```

This executes locally through PlanRunner, PackRegistry, CapabilityStepRunner,
the Research Pack, SDK HTTP policy, and the artifact index. The URL fetch,
source snapshot, extraction, Markdown export, and lineage are real. Live search,
remote distributed execution, browser automation, JavaScript execution, OAuth,
and model-generated briefs are still out of scope for this path.

Inspect runtime and packs:

```bash
npm run cli -- doctor
npm run cli -- pack list
npm run cli -- pack inspect open-lagrange.repository
```

The current demos use deterministic fixtures. The repository dry-run previews
the patch pipeline without mutating the tracked fixture. The repository live
mode copies the fixture into `.open-lagrange/demos/`, creates a local git
worktree, executes the PlanRunner through repository handlers, verifies the
change, and exports a real final patch artifact. The research demo uses
checked-in source notes rather than live network search.

Create a generic Planfile:

```bash
npm run cli -- plan create --goal "Draft a safe rollout checklist" --dry-run
```

Plan a repository change without touching your working tree:

```bash
npm run cli -- repo plan \
  --repo . \
  --goal "Add JSON output to the status command" \
  --dry-run
```

Apply the generated repository Planfile in an isolated git worktree and export a validated patch:

```bash
npm run cli -- repo apply .open-lagrange/plans/<plan_id>.plan.md
npm run cli -- repo status <plan_id>
npm run cli -- repo patch <plan_id> --output final.patch
```

This path is real local runtime execution. The Planfile is validated, repository capabilities are invoked through PackRegistry and CapabilityStepRunner, evidence is recorded, file writes happen only in `.open-lagrange/worktrees/<plan_id>/`, verification commands are allowlisted, and the final patch is exported as a reviewable artifact against the original base commit. Patch planning is still intentionally narrow and deterministic for small TypeScript/CLI tasks.

Build a Workflow Skill from ordinary Markdown:

```bash
npm run cli -- skill plan ./skills.md
```

Generate a reviewable Capability Pack scaffold from a skill:

```bash
npm run cli -- pack build examples/skills/http-json-fetcher.md --dry-run
npm run cli -- pack inspect .open-lagrange/generated-packs/local.http-json-fetcher
npm run cli -- pack validate .open-lagrange/generated-packs/local.http-json-fetcher
```

Try the generated pack lifecycle end to end with a safe Markdown Transformer:

```bash
npm run cli -- pack build examples/skills-markdown-transformer/skills.md --dry-run
npm run cli -- pack validate .open-lagrange/generated-packs/local.markdown-transformer
npm run cli -- pack install .open-lagrange/generated-packs/local.markdown-transformer
npm run cli -- restart
npm run cli -- pack health local.markdown-transformer
npm run cli -- pack smoke local.markdown-transformer
```

Install writes to the active runtime profile by default:
`~/.open-lagrange/profiles/<profile>/packs/`. Use `--workspace-local` when you
want a disposable workspace registry instead.

Configure a provider key without writing it to config:

```bash
npm run cli -- secrets set openai
npm run cli -- secrets status
```

Open the terminal cockpit:

```bash
npm run cli -- tui
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
