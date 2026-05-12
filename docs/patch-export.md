# Patch Export

When repository apply produces a final patch, export it with:

```bash
open-lagrange repo patch <plan_id_or_run_id> --output final.patch
```

The command writes a git-compatible patch and prints an apply command:

```bash
git apply final.patch
```

Patch export excludes `.open-lagrange` internal projection and artifact files. Inspect before applying:

```bash
open-lagrange repo diff <plan_id_or_run_id>
open-lagrange artifact show <final_patch_artifact_id>
```

The worktree remains available until cleanup:

```bash
open-lagrange repo worktree <plan_id_or_run_id>
open-lagrange repo cleanup <plan_id_or_run_id>
```
