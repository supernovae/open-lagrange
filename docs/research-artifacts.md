# Research Artifacts

Research runs produce indexed artifacts with lineage:

- `source_search_results`: provider or explicit URL candidates.
- `source_set`: selected and rejected sources with selection reasons.
- `source_snapshot`: fetched source bytes and metadata.
- `source_text`: extracted readable text and citation metadata.
- `research_brief`: generated markdown brief.
- `citation_index`: citation metadata when emitted separately.
- `markdown_export`: exported markdown artifact.

The Research Workbench normalizes these artifacts into a `ResearchRunView` so
web, TUI, and CLI surfaces can show source counts, selected/rejected sources,
citations, brief output, warnings, and next actions without owning run state.

Inspect artifacts:

```bash
open-lagrange run artifacts <run_id>
open-lagrange research sources <run_id>
open-lagrange research show <run_id>
```
