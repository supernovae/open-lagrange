# Plan Library

Open Lagrange looks for local Planfiles in:

- `.open-lagrange/plans`
- `~/.open-lagrange/plans`

List known plans:

```bash
open-lagrange plan library list
```

Add a named entry to the workspace manifest:

```bash
open-lagrange plan library add daily-security .open-lagrange/plans/daily-security.plan.md
```

The manifest file is `open-lagrange-plans.yaml`.

Instantiate a simple local template:

```bash
open-lagrange plan instantiate templates/brief.plan.md --param topic=security --write .open-lagrange/plans/security.plan.md
```

Template replacement supports `${key}` and `{{key}}` placeholders. Git-backed sync is intentionally left as a future extension; the current command refreshes local library listings.
