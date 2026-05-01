# Search Providers

Open Lagrange search is provider-backed and bounded. A model can propose a
SearchPlan, but the runtime validates and executes that plan with configured
providers, limits, policy, and artifact lineage.

Search does not fetch or extract page bodies. It returns normalized source
candidates. Fetch/extract remains a separate Research Pack step.

## Providers

Built-in provider kinds:

- `manual_urls`: always available; turns user-provided URLs into source
  candidates.
- `searxng`: live provider backed by a configured SearXNG instance.
- `fixture`: deterministic test/demo provider, available only with explicit
  fixture mode.

Bing and Google are not defaults because they require provider-specific terms,
credentials, and operational handling. Paid providers can be added later through
the same `SearchProvider` interface.

## Profile Config

For a managed local profile, the easiest setup is:

```bash
open-lagrange init --runtime podman --with-search
open-lagrange up --with-search
```

That configures `local-searxng` and starts the SearXNG container through the
optional Compose `search` profile.

```yaml
searchProviders:
  - id: local-searxng
    kind: searxng
    baseUrl: http://localhost:8088
    enabled: true
```

## Commands

```bash
open-lagrange search providers
open-lagrange search test-provider local-searxng
open-lagrange research search "MCP security risks" --provider local-searxng
open-lagrange research brief "MCP security risks" --url https://example.com
```

If no live provider is configured, topic search yields with remediation instead
of falling back to fixtures.

## Bounds

SearchPlan limits include:

- `max_queries`
- `max_results_per_query`
- `max_sources_to_fetch`
- `max_total_fetch_bytes`
- `max_provider_calls`
- `max_search_duration_ms`

The SearchCoordinator validates limits, chooses providers, deduplicates URLs,
applies domain filters, writes a `source_search_results` artifact, and returns
selected candidates.
