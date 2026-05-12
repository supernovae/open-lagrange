# Output Redaction

Output generation follows artifact policy metadata.

Defaults:

- restricted artifacts are excluded
- raw logs are excluded
- raw model prompts are not exported
- model-call artifacts are excluded unless explicitly requested
- unredacted artifacts are excluded unless the caller explicitly disables redacted-only selection

The Output Pack reports excluded artifacts with reasons such as `restricted`, `redaction_required`, `raw_log_excluded`, `model_call_excluded`, `kind_excluded`, or `limit_exceeded`.

Generated digests and packets use selected artifacts only. If model synthesis is used, the prompt is built from safe artifact metadata and bounded excerpts, not raw secrets.
