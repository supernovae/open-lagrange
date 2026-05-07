# Research Export

Supported research exports:

- markdown brief
- JSON source set
- JSON citation index

Markdown export:

```bash
open-lagrange research export <brief_artifact_id> \
  --format markdown \
  --output brief.md
```

Generic artifact export:

```bash
open-lagrange artifact export <artifact_id> --output output.md
```

PDF export is not provided by the Research Pack. If an output/document pack is
installed later, PDF export should route through that pack and remain visible as
a Durable Run artifact.
