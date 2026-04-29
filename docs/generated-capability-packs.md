# Generated Capability Packs

Generated Capability Packs are local source artifacts. They are useful when a
workflow needs a capability that is not already available from installed packs.

```bash
npm run cli -- pack build examples/skills/github-pr-helper.md --dry-run
npm run cli -- pack inspect .open-lagrange/generated-packs/local.github-pr-helper
npm run cli -- pack validate .open-lagrange/generated-packs/local.github-pr-helper
```

## Directory Shape

```text
.open-lagrange/generated-packs/<pack_id>/
  package.json
  tsconfig.json
  README.md
  open-lagrange.pack.yaml
  src/
    index.ts
    manifest.ts
    schemas.ts
    capabilities/
      <capability-name>.ts
  tests/
    pack.test.ts
  docs/
    security.md
    usage.md
  artifacts/
    build-plan.json
    validation-report.json
```

## Install

Install is a separate explicit step:

```bash
npm run cli -- pack install .open-lagrange/generated-packs/<pack_id>
```

Install refuses failing validation reports. Packs that require manual review
also require an explicit install flag.

## What Is Generated Today

The first implementation uses conservative deterministic templates. Generated
capabilities expose typed schemas, write dry-run artifacts, and declare scopes,
secrets, OAuth, network hosts, filesystem access, side effects, and approvals.

Future model-assisted source generation should remain behind explicit flags and
the same validation pipeline.

## Known Limits

- Custom `--output-dir` paths should stay inside the Open Lagrange checkout for
  now so generated TypeScript can resolve local workspace packages.
- Installed generated packs are registered locally but require runtime restart
  or future pack reload support before use.
- Generated capability bodies are conservative dry-run scaffolds in this phase.
