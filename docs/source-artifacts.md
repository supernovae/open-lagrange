# Source Artifacts

Research Pack artifacts preserve source provenance so later Planfiles,
Workflow Skills, and reviews can explain where context came from.

## Artifact Kinds

- `source_search_results`
- `source_snapshot`
- `source_text`
- `source_set`
- `research_brief`
- `citation_index`

## Provenance

Fetched and extracted source artifacts include:

- original URL
- final URL when available
- retrieval timestamp
- content type
- source mode: `fixture` or `live`
- extraction warnings
- producing pack and capability IDs
- input and output artifact references

Fixture artifacts are marked as fixture-backed demo sources. Live source
artifacts are fetched only through SDK HTTP primitives and network policy.
