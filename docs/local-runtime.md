# Local Runtime

Local Runtime is the workstation mode.

```bash
open-lagrange bootstrap --runtime podman
open-lagrange status
open-lagrange doctor
open-lagrange logs
open-lagrange down
```

`bootstrap` is the recommended first command. It creates or reuses the managed
`local` profile, writes the compose file, starts the local stack, waits for
readiness, and returns structured setup steps. The Hatchet client token is
created inside the compose-managed Hatchet config volume and mounted read-only
into the API and worker containers, so there is no manual token copy step.

Configure a model provider before running live cognitive steps:

```bash
open-lagrange model providers
open-lagrange model configure openai --model gpt-4o --high-model gpt-4o --coder-model gpt-4o
open-lagrange secrets set openai
```

`open-lagrange up` remains available when you want the lower-level start command
after init. It starts the compose stack for Hatchet, dependencies, the Control
Plane API, worker, and web UI. Use `--runtime docker` to choose Docker. The
managed worker exposes a local health endpoint at
`http://localhost:4318/healthz`, which `open-lagrange status` uses to report
whether the worker process is actually running.

`open-lagrange up --dev` starts Hatchet dependencies with compose and starts the
API and worker as local Node child processes. Process IDs and logs are stored
under `~/.open-lagrange/`.

Hatchet is not embedded in the Node process. It remains an internal runtime
dependency behind the Control Plane API.
