# Research Workbench

Research Workbench is the user-facing surface for Planfile-driven research.

The flow is:

```text
research prompt
  -> generated Planfile
  -> Plan Check
  -> Durable Run
  -> Run Console
  -> sources, citations, brief, exports, schedules
```

The web entrypoint is `/research`. It lets a user enter a topic or source URL,
choose a provider, set source limits, generate a Planfile, inspect Plan Check,
save the flow, schedule it, or run immediately.

Run Now creates a Durable Run and opens `/research/runs/<run_id>`. That page
uses RunSnapshot and RunEvents as projections. It does not own workflow state
and does not execute research steps directly.

The TUI Research Workbench presents the same run state with panes for sources,
brief, citations, artifacts, plan, and schedule. Keyboard shortcuts:

- `s`: sources
- `b`: brief
- `c`: citations
- `a`: artifacts
- `p`: plan
- `e`: export
- `r`: rerun
- `S`: schedule
- `q`: back

Fixture/demo execution must be explicitly requested and visibly labeled.
