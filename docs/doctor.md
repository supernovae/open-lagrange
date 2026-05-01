# Doctor

`open-lagrange doctor` checks whether the current runtime profile looks ready to run local or remote workflows.

```bash
open-lagrange doctor
```

Example shape:

```json
{
  "profile_name": "local",
  "mode": "local",
  "checks": [
    { "id": "config", "status": "pass", "summary": "Config found" },
    { "id": "secret_provider", "status": "pass", "summary": "Configured refs: openai" },
    { "id": "model_credential", "status": "pass", "summary": "Model credential appears configured." },
    { "id": "pack_registry", "status": "pass", "summary": "2 pack(s) registered." }
  ]
}
```

## Local Profile Checks

Local mode checks:

- runtime config exists
- secret references are configured or env fallback may work
- model provider credential is visible through references or env
- Control Plane API is reachable
- worker status can be inferred
- pack registry is available
- repository pack is registered
- SDK primitives are visible
- OAuth profile is valid when configured

## Remote Profile Checks

Remote mode checks:

- API is reachable
- auth is configured through profile references
- pack registry is visible through the API path
- local worker is not required

Remote project secrets should remain server-side future work. Local clients should store only the Open Lagrange auth token or OIDC token reference.

## Reading Results

`pass` means the check is ready. `warn` means the workflow may still run but setup is incomplete or inferred. `fail` means the current path is blocked until the reported issue is fixed.
