# Runtime Profiles

Runtime profiles live at `~/.open-lagrange/config.yaml`.

Profiles let the same CLI and TUI work against a local workstation runtime or a
remote Control Plane API.

```yaml
currentProfile: local

profiles:
  local:
    name: local
    mode: local
    ownership: managed-by-cli
    apiUrl: http://localhost:4317
    hatchetUrl: http://localhost:8080
    webUrl: http://localhost:3000
    runtimeManager: podman
    composeFile: ~/.open-lagrange/docker-compose.yaml
    auth:
      type: none
```

Use:

```bash
open-lagrange profile list
open-lagrange profile current
open-lagrange profile use local
open-lagrange profile add-local local-podman --runtime podman
open-lagrange profile add-remote team-dev --api-url https://lagrange.example.com
open-lagrange profile remove team-dev
```

Remote profiles are externally managed. The local CLI does not start or stop
remote infrastructure.
