# Open Lagrange, In Plain English

Open Lagrange helps you turn fuzzy requests into reviewable, checkable work.

Instead of letting a model directly run tools, Open Lagrange asks the model for
structured artifacts: plans, work orders, patch plans, reviews, and reports.
Then the control plane checks those artifacts, asks for approval when needed,
and only runs bounded capabilities.

## The Simple Version

Imagine you ask:

> Add JSON output to my CLI.

Open Lagrange does not jump straight into editing files. It can:

1. frame what you probably mean,
2. write a Planfile you can read,
3. collect evidence from the repository,
4. propose a patch plan,
5. apply it in a separate git worktree,
6. run allowed checks,
7. produce a review and final patch.

You stay in control of what gets applied.

## Why The Name?

A Lagrange point is a stable place between big forces. Open Lagrange tries to be
the stable point between cognition and execution: useful model output on one
side, careful runtime control on the other.

## Things To Try

### 1. Create A Planfile

```bash
open-lagrange plan create --goal "Make a release checklist for this project" --dry-run
```

You should see Markdown with a Mermaid graph and an executable YAML block. The
Markdown is for people. The YAML is what validation uses.

### 2. Plan A Repository Change

```bash
open-lagrange repo plan \
  --repo . \
  --goal "Add JSON output to the status command" \
  --dry-run
```

This creates a Planfile under `.open-lagrange/plans/`. Planning does not modify
your working tree.

### 3. Apply A Repository Plan In A Worktree

```bash
open-lagrange repo apply .open-lagrange/plans/<plan_id>.md
```

Open Lagrange creates an isolated worktree under `.open-lagrange/worktrees/`.
Your normal checkout is not edited directly.

### 4. Export The Final Patch

```bash
open-lagrange repo patch <plan_id> --output final.patch
```

You can inspect or apply that patch yourself.

### 5. Build A Workflow Skill

Create `skills.md`:

```markdown
# Repository Review

## Goal
Review repository files and produce a concise report.

## Inputs
- repository path

## Outputs
- review report

## Tools
- repository read
- repository review
```

Then run:

```bash
open-lagrange skill plan skills.md
```

Phase 1 only generates a reviewable Workflow Skill artifact. It does not create
new pack code or run capabilities.

### 6. Store A Secret Safely

```bash
open-lagrange secrets set openai
open-lagrange secrets status
```

Config stores a secret reference. The raw value stays in the OS keychain when
that provider is available.

## What Each Piece Means

- **Planfile**: a Markdown plan with a strict executable YAML block.
- **Capability Pack**: a bounded set of operations the runtime knows how to run.
- **Work Order**: the small typed instruction for one plan node.
- **PatchPlan**: what should change.
- **PatchArtifact**: what actually changed after applying a patch plan.
- **VerificationReport**: what checks said.
- **Workflow Skill**: a reusable Planfile-backed workflow built from existing packs.
- **SecretRef**: a pointer to a secret, not the secret itself.

## Safe Defaults

Open Lagrange is intentionally conservative:

- it does not execute freeform Markdown,
- it does not trust Mermaid graphs as execution state,
- it does not run arbitrary shell commands,
- it does not put raw secrets in model-visible context,
- it requires approval for risky side effects,
- repository changes happen in isolated worktrees first.

## Where To Read More

- [Planning Primitive](planning-primitive.md)
- [Planfiles](planfiles.md)
- [Repository Plan to Patch](repository-plan-to-patch.md)
- [Worktrees](worktrees.md)
- [Patch Artifacts](patch-artifacts.md)
- [Secrets](secrets.md)
- [Skills-to-Pack](skills-to-pack.md)
