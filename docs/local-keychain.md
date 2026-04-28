# Local Keychain

The local keychain provider stores secrets in OS-native credential storage when `keytar` is available:

- macOS Keychain
- Linux Secret Service / libsecret
- Windows Credential Manager / Credential Vault

Open Lagrange uses a service namespace of `open-lagrange`. The account key is derived from the secret scope, profile, workspace, project, and name. Secret values are never used in service or account names.

## Availability

`keytar` is an optional dependency. If the native package is unavailable on a host, keychain operations return a typed provider-unavailable error. Env fallback still works for development and CI.

## Setup

```sh
open-lagrange secrets set openai
open-lagrange secrets status
```

For scripts:

```sh
printf '%s' "$OPENAI_API_KEY" | open-lagrange secrets set openai --from-stdin
```

## Troubleshooting

- On Linux, install a Secret Service compatible keyring and libsecret support for the desktop/session environment.
- In headless CI, prefer `env` refs and injected environment variables.
- For remote profiles, use `open-lagrange auth login` to store the local API token ref.
