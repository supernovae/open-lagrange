# Repository Pack SDK Port

The Repository Task Pack now implements the Capability Pack SDK. Its descriptors
and executors are exposed through `open-lagrange.repository` and registered in
the static Pack Registry.

Repository workflows remain product-specific because patch planning,
inspection, verification, diffs, and review reports are domain behavior. The
workflow no longer calls repository executor internals directly; Hatchet tasks
execute repository capabilities through the Pack Registry.

Repository-specific concepts stay in the pack:

- path policy
- command policy
- Patch Plan
- Verification Report
- diff handling
- Review Report

General concepts stay in the SDK or Open-COT alignment notes:

- Capability Pack
- Capability Descriptor
- Capability Execution Result
- Side Effect Kind
- Idempotency Mode
- Capability Snapshot

