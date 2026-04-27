# Open Lagrange

[![CI](https://github.com/supernovae/open-lagrange/actions/workflows/ci.yml/badge.svg)](https://github.com/supernovae/open-lagrange/actions/workflows/ci.yml)
[![Containers](https://github.com/supernovae/open-lagrange/actions/workflows/containers.yml/badge.svg)](https://github.com/supernovae/open-lagrange/actions/workflows/containers.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

Open Lagrange is a TypeScript platform for deterministic reconciliation around
non-deterministic cognitive functions.

The model does not own the loop. It emits typed cognitive artifacts. Open
Lagrange validates shape, checks policy, freezes capability snapshots, records
observations, asks for approval when needed, and only then executes bounded
capabilities.

Think of it as a control plane for cognitive pipelines:

- typed cognition proposes
- policy validates
- the reconciler executes
- Capability Packs provide bounded skills
- observations and review reports explain what happened

## Why It Exists

Most tool-calling systems blur intent, execution, and authority into one
transcript. Open Lagrange keeps those pieces separate.

The practical result is a workflow you can inspect:

- what the user asked for
- what capabilities were available
- what the model proposed
- what policy allowed or denied
- what was executed
- what changed
- what verification said
- what needs approval

That makes it useful for repository work, team runbooks, platform operations,
and any workflow where “the model said so” is not an acceptable execution
boundary.

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

Run the terminal cockpit:

```bash
npm run cli -- tui --repo . --goal "Add a short README example." --dry-run
```

Check runtime health:

```bash
npm run cli -- status
npm run cli -- doctor
```

Stop local services:

```bash
npm run cli -- down
```

## Native Commands

```bash
open-lagrange init
open-lagrange up
open-lagrange tui
open-lagrange status
open-lagrange doctor
open-lagrange logs
open-lagrange down
```

Profiles make local and remote use the same interface:

```bash
open-lagrange profile list
open-lagrange profile add-remote team-dev --api-url https://lagrange.example.com
open-lagrange profile use team-dev
```

Remote profiles connect only to the Open Lagrange Control Plane API. They do
not manage Hatchet, containers, Kubernetes, OpenShift, or a VM directly.

## Repository Task Pack

The first serious Capability Pack is repository-scoped development work.

Example:

```bash
npm run cli -- repo run \
  --repo . \
  --goal "Add a --json flag to the status command and document it." \
  --dry-run
```

The Repository Task Pack can:

- inspect allowed files
- search text
- propose a patch plan
- require approval before writes
- apply validated patches
- run allowlisted verification commands
- capture a diff
- produce a PR-ready review report

It cannot read outside the repository root, read common secret files by default,
or run arbitrary shell commands.

## Runtime Model

Open Lagrange has two runtime modes.

**Local Runtime** is for a developer workstation. The CLI can manage Docker or
Podman compose services for Hatchet, dependencies, the Control Plane API,
worker, and web UI.

**Remote Runtime** is for externally managed deployments: Kubernetes,
OpenShift, a VM, remote compose, a shared team environment, or hosted setup.
The CLI and TUI connect to the Control Plane API only.

Hatchet is internal runtime plumbing. The product boundary is the Open Lagrange
Control Plane API.

## Packages

- `packages/core`: reconciliation schemas, workflows, policy, approval, status,
  and trusted local Capability Packs.
- `packages/capability-sdk`: interfaces for building bounded Capability Packs.
- `packages/runtime-manager`: profiles, Docker/Podman detection, local runtime
  supervision, doctor, and logs.
- `packages/platform-client`: fetch client for the Control Plane API.
- `apps/cli`: native command line entrypoint.
- `apps/tui`: Ink terminal reconciliation cockpit.
- `apps/web`: Next.js Control Plane API and lightweight web UI.

## Containers

Images are published to GHCR:

- `ghcr.io/supernovae/open-lagrange-api`
- `ghcr.io/supernovae/open-lagrange-worker`
- `ghcr.io/supernovae/open-lagrange-web`

Containerfiles are compatible with Docker and Podman.

```bash
docker compose -f compose.yaml build
podman compose -f compose.yaml build
```

## Development

```bash
npm run typecheck
npm test
npm run build
npm audit
```

The current local runtime is intentionally conservative. If a health check is
uncertain, `doctor` reports that uncertainty instead of pretending the stack is
healthy.
