# Open CoT Alignment

Open Lagrange treats Open CoT as the canonical portable interface layer.
Runtime-specific choices stay local; reusable interfaces should move upstream.

## Reused Concepts

- RFC 0001: cognitive artifact and reasoning evidence.
- RFC 0002: capability snapshot and endpoint descriptor.
- RFC 0003: execution intent and endpoint invocation.
- RFC 0004: policy gate and permission evaluation.
- RFC 0005: observation, receipt, and audit evidence.
- RFC 0006: reconciliation result and error taxonomy.
- RFCs 0007-0012: related runtime-boundary surfaces for pipelines, budgets,
  requester identity, human approval, conformance, and compact context.

## Upstream Change Policy

Open Lagrange is a forward-only implementation proving ground for Open CoT.
When implementation work reveals a reusable schema gap, classify it before
opening an upstream PR:

- Core changes belong in the compact core when the spec needs the capability to
  be complete, interoperable, and safely implementable by real runtimes.
- Extension changes belong outside the compact core when they normalize
  additional behavior for a use case without forcing core churn.

Core v1 is not finalized. Prefer fixing true core completeness gaps upstream
instead of carrying local-only compatibility behavior.

## Active Drift Register

| Gap | Pressure from Open Lagrange | Classification | Upstream action |
| --- | --- | --- | --- |
| Typed project execution plan | Project workflows need a validated plan that delegates scoped task workflows before endpoint execution. | Core candidate for RFC 0007 | PR https://github.com/supernovae/open-cot/pull/73 |
| Delegation context | Every workflow and MCP call needs portable authority context so execution never happens as an ambient user. | Core candidate for RFC 0009 | PR https://github.com/supernovae/open-cot/pull/73 |
| MCP endpoint binding | Open Lagrange uses MCP as the first endpoint substrate while Open-COT keeps generic `endpoint_id`. | Extension candidate | Pending PR |
| Approval linkage | Task reconciliation can return `requires_approval`, but result-to-approval linkage is minimal upstream. | Core candidate across RFC 0006 and RFC 0010 | Pending PR |
| Rich policy audit record | Runtime policy decisions need auditable inputs distinct from Zod validation. | Core if required for conformance, otherwise extension | Pending PR |

## Candidate Gaps To Evaluate

- Whether `policy_gate` needs richer portable evaluation context for audit.
- Whether `observation_receipt` needs first-class error references, receipt
  linkage, and endpoint input/output hashes in reconciliation results.
- Whether RFC 0008 execution budgets should map directly to reconciliation
  bounds.
- Whether RFC 0010 human approval, yield, and resume records need first-class
  reconciliation result linkage.

## Upstream PR Pattern

- Update the relevant RFC markdown first.
- Embed normative JSON Schema between `opencot:schema` markers.
- Run `python3 tools/sync_schemas_from_rfcs.py`.
- Add or update an example under `examples/<registry-shortname>/`.
- Run `python3 tools/validate.py`.
- Link the relevant RFC discussion thread.
- Open a merge-ready PR in `supernovae/open-cot` for core or extension gaps.

## Compatibility Notes

The local Zod schemas intentionally match Open-COT Core v1 snake_case fields.
There is no backward compatibility layer for pre-reset field names. MCP remains
a first-class Open Lagrange endpoint binding, not a forked Open-COT artifact
shape.
