# Local Runtime

Local Runtime is the workstation mode.

```bash
open-lagrange init
open-lagrange up --runtime podman
open-lagrange status
open-lagrange doctor
open-lagrange logs
open-lagrange down
```

`open-lagrange up` starts the compose stack for Hatchet, dependencies, the
Control Plane API, worker, and web UI. Use `--runtime docker` to choose Docker.

`open-lagrange up --dev` starts Hatchet dependencies with compose and starts the
API and worker as local Node child processes. Process IDs and logs are stored
under `~/.open-lagrange/`.

Hatchet is not embedded in the Node process. It remains an internal runtime
dependency behind the Control Plane API.
