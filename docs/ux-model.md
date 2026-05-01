# UX Model

Open Lagrange has five core objects:

- Plans: reusable Planfiles that describe work.
- Runs: executions of a Planfile.
- Packs: capability collections used by Planfiles.
- Artifacts: outputs, evidence, reports, and logs.
- Profiles/Providers: local or remote runtime configuration plus model/search providers.

Domain workflows are shortcuts into this model:

- A research brief is a Planfile using Research Pack capabilities.
- A repository task is a Planfile using repository capabilities.
- A skill is an input that can compile into a Planfile or a pack build plan.
- A scheduled job is a Planfile plus a trigger record.
- A demo is a sample Planfile with fixture inputs.
- An eval is a harness around Planfiles and fixtures.

The TUI and CLI keep older domain commands available, but the primary workflow is:

```bash
open-lagrange plan compose "research open source container security" --write
open-lagrange plan check .open-lagrange/plans/<plan_id>.plan.md
open-lagrange plan apply .open-lagrange/plans/<plan_id>.plan.md
open-lagrange run outputs latest
open-lagrange artifact recent
```
