# SearXNG Provider

The SearXNG provider calls a configured SearXNG `/search` endpoint through the
SDK HTTP primitive. It does not embed SearXNG code and does not scrape search
engines directly.

## Config

For local users:

```bash
open-lagrange init --runtime podman --with-search
open-lagrange up --with-search
```

The generated compose file includes SearXNG as an optional `search` profile and
exposes it at `http://localhost:8088`.

Add a provider to the current profile config:

```yaml
searchProviders:
  - id: local-searxng
    kind: searxng
    baseUrl: http://localhost:8088
    enabled: true
    language: en
    categories:
      - general
```

SearXNG is optional. Local runtime startup does not require it unless the
profile has a configured local SearXNG provider or `--with-search` is used.

## Test

```bash
open-lagrange search providers
open-lagrange search test-provider local-searxng --query "open lagrange"
```

Provider calls are bounded by SearchPlan limits and SDK HTTP primitive limits:
timeout, max response bytes, redirects, accepted content type, and network
policy.

## Failure Modes

If the provider is missing or disabled, topic search yields
`SEARCH_PROVIDER_NOT_CONFIGURED`.

If the provider returns invalid JSON or no results, the result set includes a
warning and zero source candidates.
