# Plan Builder To Run Console

The Plan Builder creates or edits a Planfile. The Run Console shows one execution of that Planfile.

Run handoff follows one path across web, TUI, and CLI:

1. Validate the Planfile.
2. Run Plan Check.
3. Block run creation when requirements are missing or the Planfile is invalid or unsafe.
4. Create a Durable Run when runnable.
5. Persist run metadata and RunEvents.
6. Open the Run Console for the new `run_id`.

Web Plan Builder sends Run actions through the Plan Builder API. A successful run creation navigates to `/runs/<run_id>`. A blocked run returns the Plan Check report and suggested actions instead of silently failing.

TUI Plan Builder uses the same core handoff. A successful run switches to Run Console mode and subscribes to the run stream when available.

CLI commands print the `run_id` plus status and watch commands:

```text
Run created: run_abc123
View live:
  open-lagrange run watch run_abc123
Inspect:
  open-lagrange run status run_abc123
```

The web and TUI never execute plan nodes directly. They create or inspect Durable Runs.
