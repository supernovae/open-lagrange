# Research Workflows

The Research Pack includes template definitions that Planfiles and Workflow
Skills can compose.

## `research_brief_from_topic`

Steps:

1. `research.search`
2. `research.fetch_source`
3. `research.extract_content`
4. `research.create_source_set`
5. `research.create_brief`
6. `research.export_markdown`

## `summarize_url`

Steps:

1. `research.fetch_source`
2. `research.extract_content`
3. `research.create_brief`
4. `research.export_markdown`

The templates do not execute work directly. They describe capability order for
the workflow layer.

## Security Shape

The pack does not execute page JavaScript, send cookies, call shell commands, or
read secrets. Live fetch uses SDK HTTP primitives for protocol checks, local
host blocking, byte limits, timeouts, redirects, redaction, and policy reports.
