# Podman And Docker

Open Lagrange supports Docker and Podman for local runtime supervision.

Runtime detection checks:

1. `podman compose`
2. `podman-compose`
3. `docker compose`
4. `docker-compose`

Podman is preferred when no runtime is specified.

```bash
open-lagrange up --runtime podman
open-lagrange up --runtime docker
```

Containerfiles are written for OCI-compatible builders and are intended to work
with both Docker and Podman.
