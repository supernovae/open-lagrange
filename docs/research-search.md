# Research Search

Research search uses the shared SearchCoordinator.

Flow:

1. Create or receive a bounded SearchPlan.
2. Resolve configured providers.
3. Execute bounded provider calls.
4. Normalize source candidates.
5. Deduplicate URLs and apply domain filters.
6. Write a `source_search_results` artifact.
7. Fetch/extract selected sources in separate Research Pack steps.

## Live Topic Search

```bash
open-lagrange research search "MCP security risks" --provider local-searxng
open-lagrange research brief "MCP security risks" --provider local-searxng
```

If no live provider is configured, the command yields clearly and suggests
configuring a provider or supplying URLs.

## Provided URLs

```bash
open-lagrange research brief "MCP security risks" \
  --url https://example.com/source-a \
  --url https://example.com/source-b
```

Provided URLs use the `manual_urls` provider and skip web search. Fetch and
extract still run as separate bounded steps.

## Fixture Mode

```bash
open-lagrange research search "planning primitive" --fixture
open-lagrange research brief "planning primitive" --fixture
```

Fixture mode is deterministic and labeled. It is for tests, demos, and explicit
offline runs only.
