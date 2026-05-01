# Research Pack

The Research Pack is a trusted local Capability Pack for safe source discovery,
bounded source fetch, text extraction, citation metadata, source sets, and cited
research brief artifacts.

Pack ID: `open-lagrange.research`

## Modes

Live mode is the default for normal user commands. URL fetch and URL summary
commands run through the PackRegistry, CapabilityStepRunner, SDK HTTP primitive,
policy checks, and artifact lineage.

```bash
open-lagrange research fetch https://example.com
open-lagrange research summarize-url https://example.com
```

Topic brief commands use live search only when a search provider is configured.
If search is unavailable, the command yields with remediation instead of using
fixtures:

- configure a search provider,
- provide explicit `--url` sources,
- or run `--fixture` for deterministic demo sources.

Fixture mode is explicit. It uses checked-in sources from
`examples/research-fixtures/` and labels artifacts with `source_mode:
fixture`.

Dry-run validates inputs, capability availability, policy, and output paths
without fetching network content or pretending source work completed.

## Commands

```bash
open-lagrange research search "planning primitive"
open-lagrange research search "planning primitive" --provider local-searxng
open-lagrange research search "planning primitive" --fixture
open-lagrange research brief "MCP security risks"
open-lagrange research brief "MCP security risks" --provider local-searxng
open-lagrange research brief "MCP security risks" --url https://example.com
open-lagrange research brief "MCP security risks" --fixture
open-lagrange research fetch https://example.com
open-lagrange research fetch https://example.com --dry-run
open-lagrange research summarize-url https://example.com
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
