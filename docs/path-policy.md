# Path Policy

Repository file access is always resolved against `repo_root` before policy is
evaluated.

Default denials:

- paths outside `repo_root`
- `.git` internals
- `.env` and `.env.*`
- `*.pem`
- `*.key`
- `id_rsa`
- `id_ed25519`
- common secret, credential, and token path names
- files larger than `max_file_bytes`

Repositories may add `.open-lagrange/repository-policy.json` to adjust allowed
paths, denied paths, byte limits, file count limits, and approval requirements.
The policy file is validated before use.
