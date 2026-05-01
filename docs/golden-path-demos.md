# Golden Path Demos

Golden path demos are local dry-run walkthroughs that make the current platform shape visible without requiring a remote runtime or live network access.

Run the fastest demo:

```bash
open-lagrange demo run repo-json-output --dry-run
```

List all demos:

```bash
open-lagrange demo list
```

Open a demo fixture:

```bash
open-lagrange demo open skills-research-brief
```

## Repository Plan-to-Patch

Demo ID: `repo-json-output`

This demo uses `examples/repo-json-output` and writes preview artifacts under `.open-lagrange/demos/repo-json-output/<run_id>/` by default.

It shows:

- a vague developer goal becoming a Planfile
- a patch plan for a bounded source change
- a patch artifact preview
- a verification report preview
- a review report preview
- an execution timeline artifact

The dry-run does not mutate the tracked fixture repository. The patch preview is deterministic so contributors can inspect the pipeline shape quickly.

Run the live local version:

```bash
open-lagrange demo run repo-json-output --live
```

Live mode copies the fixture repository into the demo output directory, initializes a local git repository, creates an isolated worktree, executes the Planfile through the generic PlanRunner and repository handlers, runs the allowlisted JSON status verification command, and exports `final.patch`.

Generated live artifacts include:

- `planfile.plan.md`
- `worktree-session.json`
- `evidence-bundle.json`
- `patch-plan.json`
- `patch-artifact.json`
- `verification-report.json`
- `review-report.json`
- `final-patch-artifact.json`
- `final.patch`
- `timeline.json`

## Research Brief Workflow Skill

Demo ID: `skills-research-brief`

This demo reads `examples/skills-research-brief/skills.md`, produces a SkillFrame, generates a WorkflowSkill artifact, previews a Planfile, and writes a mocked cited brief.

The source provider is deterministic and checked in under `examples/skills-research-brief/sources/`. No network calls are made during the dry-run.

## Notes Draft Workflow Skill

Demo ID: `skills-notes-draft`

This is a smaller Workflow Skill example for a notes workflow. It is useful when you want to inspect the SkillFrame and Planfile-backed artifact without repository details.

## Output Modes

By default, demo runs write artifacts, register them in `.open-lagrange/artifacts/index.json`, and add a run summary to `.open-lagrange/runs/index.json`.

```bash
open-lagrange demo run skills-research-brief --dry-run
open-lagrange run outputs latest
open-lagrange artifact recent
```

Use a custom directory:

```bash
open-lagrange demo run repo-json-output --dry-run --output-dir /tmp/ol-repo-demo
```

Use stdout-only mode when you want a quick summary and no files:

```bash
open-lagrange demo run skills-research-brief --dry-run --stdout-only
```

Use `--clean` to remove prior output for the same demo before writing a new run.

## What Is Mocked

The demos use deterministic fixtures. The repository dry-run does not apply a live patch to the source fixture. Repository live mode mutates only the copied fixture/worktree under the demo output directory. The research demo uses checked-in source notes instead of live search or browsing.

That is intentional for this phase: the demos prove artifact flow, validation, pack visibility, and dry-run ergonomics without requiring external services.
