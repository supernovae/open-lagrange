# HTTP Primitive

The HTTP primitive gives Capability Pack executors a bounded alternative to raw
`fetch`, `curl`, `wget`, or shell-based network calls.

## Calls

```ts
import { http } from "@open-lagrange/capability-sdk/primitives";

const response = await http.fetchJson(context, {
  url: "https://api.example.com/items",
  timeout_ms: 5000,
  max_bytes: 262144,
  allowed_hosts: ["api.example.com"],
  capture_body_as_artifact: true,
  artifact_id: "example_items_response",
});
```

The primitive supports:

- `http.fetch`
- `http.fetchJson`
- `http.downloadToArtifact`

## Defaults

- only `http` and `https` URLs are allowed
- default method is `GET`
- non-GET methods require capability policy to allow them
- localhost, private IP ranges, and metadata IPs are blocked by default
- cookies are stripped by default
- response bytes are bounded by `max_bytes`
- requests are bounded by `timeout_ms`
- redirects are bounded by `redirect_limit`
- auth uses `SecretRef` only
- authorization headers and secret-like strings are redacted
- captured responses are written through the artifact primitive with lineage

The first implementation blocks obvious local/private hostnames and literal
private IPv4 addresses. Stronger DNS resolution checks should be added before
allowing broad user-supplied hostnames in higher-risk packs.

## Policy Reports

Each HTTP call produces a `PolicyDecisionReport` in its result. Denied network
requests fail before outbound traffic. Reports include:

- decision
- capability reference
- pack id
- risk level
- side-effect kind
- matched rules
- missing scopes
- required approvals
- reason
- creation time

## Secrets

Use `auth.secret_ref` instead of embedding tokens:

```ts
await http.fetch(context, {
  url: "https://api.example.com/items",
  timeout_ms: 5000,
  max_bytes: 262144,
  allowed_hosts: ["api.example.com"],
  auth: {
    secret_ref: {
      provider: "os-keychain",
      name: "example.default",
      scope: "profile",
    },
  },
});
```

The primitive resolves the secret through the configured secret manager and
redacts the resulting header from logs, reports, and artifacts.
