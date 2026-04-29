# Pack Security Model

Generated packs are untrusted until validation and explicit install.

## Required Boundaries

- Generated code must use the Capability Pack SDK.
- Pack manifests must declare scopes, secret references, OAuth providers,
  network hosts, filesystem access, side effects, and approval requirements.
- Secrets are referenced with `SecretRef`; raw values are never embedded in
  source, prompts, logs, or artifacts.
- Network calls must go through SDK primitives that can enforce allowed hosts.
- Filesystem writes require declared access and approval policy.
- PackRegistry remains the registration boundary.

## Blocked Patterns

The static validator rejects obvious unsafe TypeScript patterns, including:

- `child_process`
- `exec(`
- `spawn(`
- `eval(`
- `new Function`
- direct `process.env`
- raw `fetch(`
- direct `fs`, `net`, `tls`, `http`, or `https` imports
- suspicious secret logging text

This is not a proof of safety. It is an early gate before compile, tests, review,
and explicit install.

## Secrets

Generated code should request credentials by reference:

```ts
const token = await context.secrets.resolve({
  provider: "os-keychain",
  name: "github.default",
  scope: "profile",
});
```

The token must not be logged, returned, written to artifacts, or included in
model-visible context.

