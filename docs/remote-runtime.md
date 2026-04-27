# Remote Runtime

Remote Runtime is for externally managed deployments.

Examples:

- Kubernetes
- OpenShift
- a VM
- remote Docker or Podman compose
- shared team environments
- hosted deployments

Add a remote profile:

```bash
open-lagrange profile add-remote team-dev --api-url https://lagrange.example.com
open-lagrange profile use team-dev
open-lagrange status
open-lagrange doctor
```

In remote mode, the CLI and TUI use only the Open Lagrange Control Plane API.
They do not require Hatchet credentials and do not assume Hatchet is reachable
from the workstation.

Remote logs are unavailable unless a future Control Plane API endpoint exposes
them.
