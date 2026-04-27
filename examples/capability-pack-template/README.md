# Capability Pack Template

This template shows the minimum shape of a local trusted Capability Pack:

- a manifest
- one descriptor
- Zod input and output schemas
- an executor
- static registration by code

Use `createPackRegistry().registerPack(exampleCapabilityPack)` in tests or a
local runtime module. Do not load this package dynamically from user config in
the current Open Lagrange runtime.

