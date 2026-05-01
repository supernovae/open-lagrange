# First Real Demo

The first real product workflow is the Repository Task Pack. It proves the
core execution model on a local repository without granting open filesystem or
shell authority.

## Start Services

```bash
hatchet server start
npm run dev:worker
```

In another terminal, run the web UI if desired:

```bash
npm run dev:web
```

## Dry-Run Repository Task

Dry-run is the default. The workflow can inspect allowed files, create a patch
plan, preview touched files, and stop for approval without writing.

```bash
open-lagrange repo run \
  --repo . \
  --goal "Add a short Repository Task Pack note to the README."
```

Then inspect status:

```bash
open-lagrange repo status <task-run-id>
open-lagrange repo review <task-run-id>
```

Approve the pending patch:

```bash
open-lagrange repo approve <task-run-id> --reason "Patch is scoped"
open-lagrange repo status <task-run-id>
```

Approval starts a repository continuation workflow run. The continuation uses
the exact persisted patch plan and validates hashes before applying.

## Apply Mode

Apply mode is explicit. The patch is still validated through repository path
policy, expected hashes, command policy, and the task policy gate before any
write occurs.

```bash
open-lagrange repo run \
  --repo . \
  --goal "Add a short Repository Task Pack note to the README." \
  --apply
```

After completion:

```bash
open-lagrange repo diff <task-run-id>
open-lagrange repo review <task-run-id>
```

## Example Web API Request

```bash
curl -s http://localhost:3000/api/repository/jobs \
  -H 'content-type: application/json' \
  -d '{"goal":"Add a short Repository Task Pack note to the README.","repo_root":".","dry_run":true}'
```

## Safety Boundary

- Reads and writes are resolved under `repo_root`.
- `.git` internals and secret-shaped files are denied by default.
- Patch plans are validated before preview or application.
- Modify and delete operations can include expected file hashes.
- Verification commands must match the trusted allowlist.
- The model emits structured proposals only; it never receives filesystem or
  command execution authority.
