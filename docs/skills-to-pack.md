# Skills-to-Pack Phase 1

Phase 1 builds Workflow Skill artifacts from ordinary `skills.md` files. It does not generate capability pack code, executable scripts, or arbitrary runtime commands.

## Workflow Skills

A Workflow Skill is a Planfile-backed artifact that composes existing capability packs. The input markdown is a collaboration surface. The embedded `workflow_skill` YAML block is the proposed executable artifact, and it must validate before dry-run.

```bash
open-lagrange skill frame skills.md
open-lagrange skill plan skills.md
open-lagrange skill validate workflow.skill.md
open-lagrange skill run workflow.skill.md --dry-run
```

`skill plan` prints markdown by default. Use `--output <path>` or `--write` to persist the artifact.

## Skillfile Input

Phase 1 accepts permissive markdown. It recognizes common headings when present:

- Goal
- Inputs
- Outputs
- Rules
- Constraints
- Tools
- Permissions
- Secrets
- Examples
- Approval

When headings are missing, Open Lagrange still creates a typed SkillFrame with assumptions and questions. Empty files fail.

## Compose or Build Decision

If existing packs satisfy the required behavior, Open Lagrange generates a Workflow Skill. If capabilities are missing, the decision is `capability_pack_required` with descriptions of what is missing. If the request is unsafe, the decision is `unsupported` with safety concerns.

Missing capabilities are future work. Phase 1 records them but does not generate capability pack code.

## Secrets and Safety

Skill artifacts use SecretRefs only. Raw secret values are redacted and rejected by validation. Side effects, writes, sends, deletes, network access, and destructive behavior require explicit approval.

`skill run --dry-run` validates and previews the Planfile template. It does not dispatch capabilities, call external APIs, mutate files, or create runtime state.
