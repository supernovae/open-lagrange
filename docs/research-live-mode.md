# Research Live Mode

Normal Research Pack commands are live by default where live work is feasible.

```bash
open-lagrange research fetch https://example.com
open-lagrange research summarize-url https://example.com
open-lagrange research brief "MCP security risks" --url https://example.com
```

Live URL fetch uses `research.fetch_source`, the SDK HTTP primitive, policy
evaluation, retry/rate limits, redaction, and artifact lineage. Unsafe URLs,
unsupported protocols, disallowed hosts, content-type mismatches, timeouts, and
response-size limits fail the capability result.

Topic briefs need search results before source fetch and synthesis. If no live
search provider is configured, `research brief "<topic>"` yields with a clear
message. It does not use fixtures unless `--fixture` is present.

Current search provider status: the provider abstraction is in place, and the
live provider is a placeholder that reports `SEARCH_PROVIDER_NOT_CONFIGURED`.
Future providers can implement Tavily, Brave, Bing, SerpAPI, or an internal
search service behind the `SearchProvider` interface.
