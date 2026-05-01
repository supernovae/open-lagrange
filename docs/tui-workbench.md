# TUI Workbench

The TUI is organized as a Plan/Run workbench.

Primary areas:

- Home: runtime status, current plan, shortcuts, recent artifacts.
- Plans: current Planfile summary and validation context.
- Runs: run timeline and outputs.
- Artifacts: indexed outputs and evidence.
- Packs: installed capability packs.
- Providers: profile, model, and search provider status.
- Schedules: schedule records for Planfiles.
- Doctor: local runtime checks.

Natural language input suggests a Planfile composition flow. Slash commands provide precise control:

```text
/compose <goal>
/check <planfile>
/library
/run list
/run outputs latest
/artifacts
/packs
/providers
/schedule
```

Domain commands such as `/research brief`, `/repo run`, and `/skill plan` remain available as shortcuts.
