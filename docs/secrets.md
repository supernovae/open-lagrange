# Secrets

Open Lagrange stores secret references in config, not raw secret values.

Profiles may contain `secretRefs`:

```yaml
profiles:
  local:
    mode: local
    apiUrl: http://localhost:4317
    auth:
      type: none
    secretRefs:
      openai:
        provider: os-keychain
        name: openai-api-key
        scope: profile
      open_lagrange_token:
        provider: os-keychain
        name: api-token
        scope: profile
```

The runtime resolves a `SecretRef` only inside trusted code paths. Model-visible prompts, TUI status, logs, and normal CLI output receive redacted metadata only.

## Providers

- `os-keychain`: default local provider using OS-native credential storage through optional `keytar`.
- `env`: read-only provider for CI and development fallback.
- `vault` and `external`: interface placeholders for future server-side or third-party providers.

## CLI

```sh
open-lagrange secrets set openai
open-lagrange secrets set openai --from-stdin
open-lagrange secrets get openai --redacted
open-lagrange secrets list
open-lagrange secrets status
open-lagrange secrets delete openai
```

`secrets get` returns redacted metadata. Raw output is intentionally not implemented in the first pass.

Remote profile auth tokens use:

```sh
open-lagrange auth login
open-lagrange auth status
open-lagrange auth logout
```

## Runtime Behavior

Local runtime startup resolves profile secrets and injects needed provider keys into child process or compose environment variables. Config files and generated status output still contain references only.

Env fallback remains supported:

```sh
OPENAI_API_KEY=... open-lagrange up --dev
```

Model provider secrets follow the provider ID convention:

```sh
npm run cli -- model providers
npm run cli -- model configure openrouter --model openai/gpt-4o --high-model openai/gpt-4o --coder-model anthropic/claude-3.5-sonnet
npm run cli -- secrets set openrouter
```

See [model-providers.md](model-providers.md) for named providers, endpoint overrides, and model slot conventions.

## Remote Mode

Remote profiles should store only local Open Lagrange auth token references. Project or workspace secrets managed by a remote control plane are future work and should not be synced into local config.

Future providers may include Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, Bitwarden, and 1Password.
