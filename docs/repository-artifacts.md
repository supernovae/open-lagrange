# Repository Artifacts

Repository runs produce typed artifacts that are linked to the Planfile and Run Console.

## Artifact Kinds

- `planfile`: source Planfile for the run
- `evidence_bundle`: inspected files, findings, search results, and notes
- `patch_plan`: schema-bound PatchPlan proposed from evidence
- `patch_validation_report`: PatchPlan validation result
- `patch_artifact`: applied patch and unified diff
- `verification_report`: verification command results and failures
- `repair_decision`: bounded repair decision and attempt metadata
- `repair_patch_plan`: PatchPlan produced during repair
- `scope_expansion_request`: requested files, capabilities, commands, and risk change
- `review_report`: final review notes and follow-ups
- `final_patch_artifact`: exportable final patch
- `model_call`: model-call telemetry summary and artifact references
- `raw_log`: raw command output where captured

## Rendering

CLI, web, and TUI use the repository run projection to render:

- EvidenceBundle as inspected file and finding tables
- PatchPlan as operations and expected changed files
- PatchArtifact and final patch as unified diffs
- VerificationReport as command status, exit code, excerpts, and raw log links
- ReviewReport as a concise markdown-style review summary
- ModelCall as role, provider/model, token/cost summary, and artifact links
