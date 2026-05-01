# Command Taxonomy

CLI help is grouped around product intent:

- Core runtime: `init`, `bootstrap`, `up`, `down`, `restart`, `status`, `doctor`, `logs`, `tui`
- Primary work: `plan`, `run`, `artifact`, `pack`
- Configuration: `profile`, `provider`, `secrets`, `auth`, `model`, `search`
- Domain shortcuts: `repo`, `research`, `skill`
- Advanced/dev: `demo`, `eval`

Domain commands remain stable shortcuts:

- `repo plan` composes a repository Planfile.
- `research brief` composes and runs a research Planfile path.
- `skill plan` compiles a skill file into a Planfile-backed artifact.
- `demo run` runs a sample Planfile with fixture inputs where appropriate.

Prefer primary commands when sharing instructions because they make the reusable object explicit.
