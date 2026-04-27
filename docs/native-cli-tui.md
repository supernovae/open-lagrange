# Native CLI And TUI

The CLI and TUI are clients of the Control Plane API.

Normal workflow commands do not call Hatchet directly. Local runtime commands
may manage Docker or Podman compose services because that is workstation
supervision, not product API usage.

Useful commands:

```bash
open-lagrange init
open-lagrange up
open-lagrange tui
open-lagrange status
open-lagrange doctor
open-lagrange logs api
open-lagrange down
```

The TUI status strip shows profile, mode, API state, local runtime state when
available, registered packs, and model provider status.

Shortcuts:

- `s`: start Local Runtime
- `d`: run doctor
- `p`: prepare profile command
- `l`: show local logs
- `r`: refresh
- `q`: quit
