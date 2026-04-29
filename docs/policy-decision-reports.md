# Policy Decision Reports

Policy gates can emit a typed decision report alongside the allow, deny, yield, or approval result.

Fields include:

- `decision`
- `capability_ref`
- `pack_id`
- `risk_level`
- `side_effect_kind`
- `delegation_context_summary`
- `matched_rules`
- `missing_scopes`
- `required_approvals`
- `reason`

Reports are intended for audit views, TUI detail panes, pack smoke tests, and future execution timelines. They summarize why the control plane allowed or blocked a capability without leaking secrets or model-visible private data.
