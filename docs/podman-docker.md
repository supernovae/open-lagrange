# Podman And Docker

Open Lagrange supports Docker and Podman for local runtime supervision.

Runtime detection checks:

1. rootless Podman machine compose when the default Podman connection is rootful
2. `podman compose`
3. `podman-compose`
4. `docker compose`
5. `docker-compose`

Podman is preferred when no runtime is specified.

```bash
open-lagrange bootstrap --runtime podman
open-lagrange bootstrap --runtime docker
```

Use `bootstrap` for first-time local setup. It replaces the manual `init` then
`up` sequence for most users and returns the readiness of the profile, compose
file, Hatchet token setup, API, worker, and web UI. The lower-level commands are
still available:

```bash
open-lagrange init --runtime podman
open-lagrange up --runtime podman
```

Containerfiles are written for OCI-compatible builders and are intended to work
with both Docker and Podman.

On macOS, Podman rootful machine connections may start containers successfully
without forwarding published ports back to `localhost`. The runtime manager
prefers the matching rootless machine connection when it exists, so
`http://localhost:4317`, `http://localhost:3000`, and `http://localhost:8080`
remain reachable from the host.

The generated compose file lives under `~/.open-lagrange`, but its build context
points back to the Open Lagrange source checkout so local container builds can
find `containers/*.Containerfile`. If your checkout is in an unusual location,
set it explicitly before init:

```bash
OPEN_LAGRANGE_SOURCE_ROOT=/path/to/open-lagrange open-lagrange init --runtime podman
```

For the one-command path, set the same variable before bootstrap:

```bash
OPEN_LAGRANGE_SOURCE_ROOT=/path/to/open-lagrange open-lagrange bootstrap --runtime podman
```

RabbitMQ queue data is intentionally ephemeral in the local compose stack. The
generated compose runs the RabbitMQ container as the image's `rabbitmq` user so
Podman-created data directories do not leave the Erlang cookie owned by `root`.
If a previous startup left RabbitMQ in a bad state, stop the stack and remove
only the stale RabbitMQ container/old named volume before retrying:

```bash
open-lagrange down
podman rm -f open-lagrange-rabbitmq-1
podman volume rm open-lagrange_hatchet_rabbitmq_data
open-lagrange bootstrap --runtime podman
```

Do not remove the PostgreSQL or `open_lagrange_data` volumes unless you are
intentionally resetting local runtime state.

The managed Hatchet setup also writes a local client token into the Hatchet
config Docker/Podman volume and mounts it read-only into the API and worker
containers. The token is not written to `~/.open-lagrange/config.yaml`.
