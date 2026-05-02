# Collaborative Plan Builder

The Plan Builder turns a prompt, Planfile, template, or `skills.md` content into a stable Planfile through a bounded review loop.

Lifecycle:

```text
input -> IntentFrame -> draft Planfile -> simulation -> validation -> questions -> revision -> ready Planfile
```

The builder always runs deterministic simulation and validation. It asks typed questions only when ambiguity changes execution, such as missing schedule time, provider choice, credentials, external side effects, risky scope expansion, or destructive scope.

Model-backed revision is gated. It runs only when a configured planner route is available and semantic revision is required. The model emits a schema-bound `PlanRevision`; the control plane validates and applies the revision. No capability execution happens during composition.

CLI:

```bash
open-lagrange plan compose "research supply chain security" --interactive
open-lagrange plan builder start "Every morning, make me a cited brief on container security"
open-lagrange plan builder answer <session_id> <question_id> "08:00"
open-lagrange plan builder accept-defaults <session_id>
open-lagrange plan builder save <session_id> --output .open-lagrange/plans/security.plan.md
```

Web:

Use the Plan Builder page to compose, answer questions, inspect simulation and validation, preview the Planfile, save, run, or schedule when ready.
