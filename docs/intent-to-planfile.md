# Intent-to-Planfile

Intent-to-Planfile lets a user describe work in natural language and receive a reviewable Planfile built from installed capabilities.

The flow is:

1. Interpret the prompt into an `IntentFrame`.
2. Match installed packs, capabilities, and templates.
3. Compose a Planfile DAG.
4. Render Markdown with a Mermaid graph and executable YAML.
5. Let the user edit, validate, run, save, or schedule explicitly.

The model may help classify ambiguous prompts when configured, but the control plane validates capability references, policy, execution mode, approval needs, and schedule metadata.

## Examples

```bash
open-lagrange plan compose "Research OpenShift AI GPU scheduling and save a markdown brief."
open-lagrange plan compose "Add JSON output to my CLI status command." --repo .
open-lagrange plan compose "Every morning, make me a cited brief on open source container security." --write
```

Default output is Markdown. Use `--write` to create `.open-lagrange/plans/<plan_id>.plan.md`.

## Safety

The composer does not invent capabilities. If required capabilities are unavailable, the result yields a clear missing capability report. Fixture and mock paths are not selected for live composition.

Schedules are captured as intent first. Timed execution is not hidden or automatic.
