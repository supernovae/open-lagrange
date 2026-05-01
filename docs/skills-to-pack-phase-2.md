# Skills-to-Pack Phase 2

Phase 2 turns a `skills.md` request into a reviewable Capability Pack source
tree when existing packs cannot satisfy the requested workflow.

```bash
open-lagrange pack build examples/skills/http-json-fetcher.md --dry-run
open-lagrange pack inspect .open-lagrange/generated-packs/local.http-json-fetcher
open-lagrange pack validate .open-lagrange/generated-packs/local.http-json-fetcher
```

The build command does not install the pack. It writes local source under
`.open-lagrange/generated-packs/<pack_id>/`, runs validation, records artifacts,
and leaves the source available for review.

## Flow

1. Parse `skills.md`.
2. Produce a typed `SkillFrame`.
3. Match requested capabilities against the PackRegistry.
4. If existing packs are insufficient, create a `PackBuildPlan`.
5. Generate deterministic Capability Pack source.
6. Validate manifest, schemas, static safety, TypeScript compile, and tests.
7. Produce artifacts for review.
8. Install only after explicit `pack install`.

## Phase Boundary

Generated source is not trusted. It must compile, validate, declare
permissions, pass checks, and run through the Capability Pack SDK before it can
be registered locally.

Phase 2 does not dynamically load generated code into the running process. A
successful install copies reviewed source into the local pack registry and marks
it for runtime reload or restart.

## Open-COT Alignment

Portable concepts:

- `SkillFrame`
- `WorkflowSkill`
- `PackBuildPlan`
- `CapabilityDescriptor`
- `CapabilityPackManifest`
- `SecretRef`
- `OAuthRequirement`
- `NetworkRequirement`
- `SideEffectKind`
- `ValidationReport`

Implementation-specific concepts:

- `.open-lagrange/generated-packs/<pack_id>/`
- TypeScript scaffold layout
- local static safety validator
- npm test and compile checks
- OS keychain-backed local secret provider

