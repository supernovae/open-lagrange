# Repository TUI

Repository mode reads durable workflow state. The TUI does not own repository execution state.

The plan view can display:

- Planfile status and current node
- worktree path
- evidence bundle IDs
- changed files
- patch artifact IDs
- verification report IDs
- repair attempt IDs
- final patch artifact ID
- warnings and validation errors

Controls route back to CLI/API actions such as apply, show patch, show verification, show evidence, retain worktree, and cleanup. The state source remains the repository PlanRunner status and artifact index.
