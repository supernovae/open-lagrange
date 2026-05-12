# Exporting Artifacts

Export a single artifact:

```bash
open-lagrange artifact export <artifact_id> --output artifact.md
open-lagrange artifact export <artifact_id> --format html --output artifact.html
open-lagrange artifact export <artifact_id> --format pdf --output artifact.pdf
```

Export selected outputs from a run:

```bash
open-lagrange output export --run <run_id> --preset final_outputs --format directory --output ./out
open-lagrange output export --run <run_id> --preset developer_packet --format zip --output ./handoff.zip
```

PDF is optional. If no sandboxed PDF renderer is configured, `render-pdf` returns `unsupported` and suggests Markdown, HTML, or ZIP alternatives.
