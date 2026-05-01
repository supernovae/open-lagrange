# Research Live Fetch

`research.fetch_source` supports live mode by default and fixture mode only when
explicitly requested.

```bash
open-lagrange research fetch https://example.com
open-lagrange research summarize-url https://example.com
```

Live fetch runs through the SDK HTTP primitive. The Research Pack does not use
raw network calls, shell commands, browser automation, JavaScript execution, or
OAuth.

## Artifact Flow

- `source_snapshot`: raw fetched body captured by the SDK HTTP primitive.
- `source_text`: extracted readable text with citation metadata.
- `research_brief`: exported deterministic Markdown when run through the
  Research URL Summary Planfile.

Each artifact records the producing pack/capability, plan/node when present,
input artifact refs, validation status, redaction status, and `source_mode`.

## Network Policy

The SDK HTTP primitive only allows HTTP(S), blocks localhost and private
addresses by default, strips cookies unless explicitly allowed, enforces GET for
this capability, validates accepted content types, and applies timeout and
response-size limits.
