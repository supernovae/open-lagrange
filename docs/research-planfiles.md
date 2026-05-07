# Research Planfiles

Research is represented as a Planfile before it runs. The default supported
templates are:

- `research.topic_brief`: search, select, fetch, extract, source set, brief, and markdown export.
- `research.url_summary`: fetch one URL, extract content, create a cited summary, and export markdown.
- `research.digest`: scaffold-only until multi-topic branch execution is available.

Create a research Planfile:

```bash
open-lagrange research plan "open source container security" \
  --provider local-searxng \
  --write
```

Run Plan Check before execution:

```bash
open-lagrange plan check .open-lagrange/plans/research/<plan>.plan.md
```

Run it:

```bash
open-lagrange plan run .open-lagrange/plans/research/<plan>.plan.md
```

The resulting `run_id` is the handle for status, watch, explain, artifacts,
approvals, retry, resume, and export.
