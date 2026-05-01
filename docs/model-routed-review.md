# Model-Routed Review

Repository apply can route ReviewReport generation through the reviewer role. The reviewer receives a bounded summary:

- GoalFrame
- Planfile node summary
- changed files
- PatchArtifact summaries
- VerificationReport summaries
- repair attempt summaries
- final diff summary
- known limitations

The reviewer returns a strict ReviewReport object. The control plane rejects review output that claims verification passed when VerificationReport data says it failed. Deterministic review remains the fallback path when no reviewer generator is configured.

This keeps ReviewReport generation measurable in live evals without allowing the model to mutate files, run commands, or inspect the repository directly.

