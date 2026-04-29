# Research Pack

The Research Pack is a trusted local Capability Pack for safe source discovery,
bounded source fetch, text extraction, citation metadata, source sets, and cited
research brief artifacts.

Pack ID: `open-lagrange.research`

## Modes

Fixture mode is the default. It uses checked-in sources from
`examples/research-fixtures/` and works offline.

Live URL fetch is explicit. Use `--live` for one URL at a time:

```bash
npm run cli -- research fetch https://example.com --live
```

Live search is not implemented in this phase. If requested, the pack returns a
structured warning and fixture-backed candidates.

## Commands

```bash
npm run cli -- research search "planning primitive" --fixture
npm run cli -- research brief "MCP security risks" --fixture
npm run cli -- research fetch https://example.com --live
```

The commands write indexed artifacts under `.open-lagrange/research/`.

## Capabilities

- `research.search`
- `research.fetch_source`
- `research.extract_content`
- `research.create_source_set`
- `research.create_brief`
- `research.export_markdown`

The pack provides capabilities and workflow templates. The workflow layer owns
ordering and execution state.
