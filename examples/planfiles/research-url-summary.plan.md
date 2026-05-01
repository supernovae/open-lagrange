# Planfile: Research URL Summary

Fetch a safe public URL through the Research Pack, extract readable text, and export a deterministic Markdown summary artifact.

## Executable Plan

```yaml planfile
schema_version: open-lagrange.plan.v1
plan_id: plan_research_url_summary
goal_frame:
  goal_id: goal_research_url_summary
  original_prompt: Summarize https://example.com through the live Research Pack path.
  interpreted_goal: Research URL Summary for https://example.com
  acceptance_criteria:
    - The URL is fetched through research.fetch_source in explicit live mode.
    - Source and extracted text artifacts are recorded with lineage.
    - A Markdown summary artifact is exported.
  non_goals:
    - Do not execute JavaScript.
    - Do not use browser automation.
    - Do not require OAuth.
  assumptions:
    - https://example.com is reachable from the local runtime.
    - A deterministic extractive summary is sufficient for this workflow.
  ambiguity:
    level: low
    questions: []
    blocking: false
  suggested_mode: apply_with_approval
  risk_notes:
    - Live network reads are limited by the SDK HTTP primitive and network policy.
  created_at: "2026-04-30T00:00:00.000Z"
mode: apply
status: validated
nodes:
  - id: fetch_source
    kind: inspect
    title: Fetch source URL
    objective: Fetch https://example.com as a live source snapshot.
    description: Use the Research Pack fetch capability through the capability step runner.
    depends_on: []
    allowed_capability_refs:
      - research.fetch_source
    expected_outputs:
      - source_snapshot
      - source_text
    acceptance_refs:
      - acceptance:1
      - acceptance:2
    risk_level: read
    approval_required: false
    status: pending
    artifacts: []
    errors: []
  - id: extract_content
    kind: analyze
    title: Extract readable content
    objective: Extract readable text from the fetched source snapshot.
    description: Resolve the fetched artifact and produce normalized source text.
    depends_on:
      - fetch_source
    allowed_capability_refs:
      - research.extract_content
    expected_outputs:
      - source_text
    acceptance_refs:
      - acceptance:2
    risk_level: read
    approval_required: false
    status: pending
    artifacts: []
    errors: []
  - id: export_markdown
    kind: finalize
    title: Export Markdown summary
    objective: Export a deterministic Markdown summary artifact from extracted text.
    description: Create a simple source-backed Markdown summary without model generation.
    depends_on:
      - extract_content
    allowed_capability_refs:
      - research.export_markdown
    expected_outputs:
      - research_brief
    acceptance_refs:
      - acceptance:3
    risk_level: read
    approval_required: false
    status: pending
    artifacts: []
    errors: []
edges:
  - from: fetch_source
    to: extract_content
    reason: Extract content from the fetched source artifact.
  - from: extract_content
    to: export_markdown
    reason: Export the extracted content as Markdown.
approval_policy:
  require_approval_for_risks:
    - write
    - external_side_effect
    - destructive
verification_policy:
  allowed_command_ids: []
execution_context:
  runtime: local
  workspace_id: workspace-local
  nodes:
    fetch_source:
      input:
        url: https://example.com
        source_id: example-com
        mode: live
        max_bytes: 500000
        timeout_ms: 8000
        accepted_content_types:
          - text/html
          - text/plain
          - text/markdown
          - application/xhtml+xml
    extract_content:
      input:
        source_artifact_id: "$nodes.fetch_source.output.raw_artifact_id"
        url: "$nodes.fetch_source.output.final_url"
        max_chars: 20000
    export_markdown:
      input:
        title: "Research URL Summary: example.com"
        markdown: |
          # Research URL Summary: example.com

          Source: {{nodes.extract_content.output.title}}

          URL: {{nodes.extract_content.output.url}}

          ## Summary

          {{nodes.extract_content.output.excerpt}}

          ## Citation

          {{nodes.extract_content.output.citation.citation_id}}: {{nodes.extract_content.output.title}} ({{nodes.extract_content.output.url}})
        related_source_ids:
          - "$nodes.extract_content.output.source_id"
artifact_refs: []
created_at: "2026-04-30T00:00:00.000Z"
updated_at: "2026-04-30T00:00:00.000Z"
```
