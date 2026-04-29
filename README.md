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
- **Secrets**: store local credentials as OS keychain references instead of plaintext config.
- **CLI/TUI/API**: use the native CLI, Ink TUI, or local Control Plane API.

Start with the friendly walkthrough: [docs/ELI5_start.md](docs/ELI5_start.md).

Fastest dry-run demo:

```bash
npm run cli -- demo run repo-json-output --dry-run
```

That command writes a Planfile, patch plan, patch artifact preview, verification
report, review report, and timeline under `.open-lagrange/demos/`, then indexes
them for `artifact list/show/export`.

## Quickstart

```bash
git clone git@github.com:supernovae/open-lagrange.git
cd open-lagrange
npm install
npm run build
```

Create a local runtime profile and start the stack:

```bash
npm run cli -- init
npm run cli -- up --runtime podman
```

Docker works too:

```bash
npm run cli -- up --runtime docker
```

Check health:

```bash
npm run cli -- status
npm run cli -- doctor
```

## Demos And Experiments

Run the repository Plan-to-Patch demo:

```bash
npm run cli -- demo run repo-json-output --dry-run
npm run cli -- artifact list
```

Run the same demo through a live isolated fixture repo and git worktree:

```bash
npm run cli -- demo run repo-json-output --live
npm run cli -- artifact list
```

Run the Research Brief Workflow Skill demo:

```bash
npm run cli -- demo run skills-research-brief --dry-run
npm run cli -- artifact list
```

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

Build a Workflow Skill from ordinary Markdown:

```bash
npm run cli -- skill plan ./skills.md
```

Configure a provider key without writing it to config:

```bash
npm run cli -- secrets set openai
npm run cli -- secrets status
```

Open the terminal cockpit:

```bash
npm run cli -- tui
```

## Current Capabilities

Open Lagrange currently includes:

- Planning Primitive and Planfiles
- Capability Pack SDK and PackRegistry
- Repository Task Pack with isolated worktree execution
- patch plans, patch artifacts, verification reports, and review reports
- bounded repair attempt tracking
- SecretProvider abstraction with OS keychain and env fallback
- runtime profiles for local and remote control-plane use
- CLI, TUI, and Next.js API surfaces
- Workflow Skill Builder Phase 1
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
- [Doctor](docs/doctor.md)
- [Pack inspection](docs/pack-inspection.md)
- [Planfiles](docs/planfiles.md)
- [Skills-to-Pack](docs/skills-to-pack.md)

## Roadmap

The next phase is wiring the demo previews into more live local execution while
keeping the same boundaries: typed Planfiles, capability-pack execution, OS
keychain-backed secrets, policy gates, approvals, verification, and exportable
artifacts.

## Development

```bash
npm run typecheck
npm test
npm run build
```

Image: NASA illustration of JWST near L2, public domain via
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:JWST-at-L2-Lagragian-Point.jpg).
