# Output Pack

The Output Pack is the trusted local pack for turning Run artifacts into user-facing deliverables. It reads the artifact index, respects redaction and restriction metadata, preserves lineage, and writes derived outputs back as artifacts.

Pack ID: `open-lagrange.output`

Capabilities:

- `output.select_artifacts`
- `output.create_digest`
- `output.create_run_packet`
- `output.render_markdown`
- `output.render_html`
- `output.render_pdf`
- `output.export_artifacts`
- `output.create_manifest`

PDF rendering is capability-gated. In this build it returns `unsupported` with Markdown, HTML, and ZIP alternatives instead of failing a run.

## CLI

```bash
open-lagrange output select --run <run_id> --preset final_outputs
open-lagrange output digest --run <run_id> --style developer
open-lagrange output packet --run <run_id> --type research
open-lagrange output render-html <brief_artifact_id>
open-lagrange output render-pdf <brief_artifact_id>
open-lagrange output export --run <run_id> --preset research_packet --format directory --output ./out
open-lagrange output manifest --run <run_id>
```

Use `--deterministic` for digest and packet generation when model synthesis should be skipped. Use `--model` to prefer a configured model route, with deterministic fallback if the provider is unavailable.

## Presets

- `final_outputs`: final patch, research brief, review report, Markdown/HTML/PDF exports, digest, and run packets.
- `research_packet`: research brief, citation index, source set, search metadata, Planfile, and safe run summary artifacts.
- `developer_packet`: Planfile, evidence bundle, PatchPlan, final patch, verification report, review report, and model-call summaries when explicitly included.
- `debug_packet`: timeline, structured errors, policy reports, validation reports, and model-call summaries. Raw logs are excluded unless explicitly requested and allowed.
- `all_safe`: all safe artifacts after redaction and restriction checks.
