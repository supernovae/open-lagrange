# Artifacts

Artifacts are durable records that make planned and completed work reviewable. They are separate from prompts and separate from transient console output.

The local artifact index lives at:

```text
.open-lagrange/artifacts/index.json
```

Demo runs and future workflows can register artifacts there so the CLI and TUI can show a consistent view.

## Artifact Kinds

Current common kinds:

- `planfile`
- `skill_frame`
- `workflow_skill`
- `patch_plan`
- `patch_artifact`
- `verification_report`
- `review_report`
- `research_brief`
- `approval_request`
- `execution_timeline`
- `raw_log`

Every artifact summary includes an ID, kind, title, summary, path or URI, creation time, redaction marker, and exportability flag. Related plan, task, pack, demo, or skill IDs can be attached when available.

The repository live demo stores both structured patch metadata and a plain `final.patch` file as `patch_artifact` entries so the same index can drive CLI export and TUI review.

## CLI

List artifacts:

```bash
npm run cli -- artifact list
```

Show a redacted artifact:

```bash
npm run cli -- artifact show <artifact_id>
```

Export an artifact:

```bash
npm run cli -- artifact export <artifact_id> --output ./final.patch
```

Rebuild the local index from known artifact directories:

```bash
npm run cli -- artifact reindex
```

## Redaction

Artifact viewing applies defensive redaction for fields whose names look sensitive, such as `value`, `secret`, or `token`. Raw secrets should not be written to artifacts, and the viewer is a second layer of protection for status and review screens.
