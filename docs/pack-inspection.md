# Pack Inspection

Pack inspection makes capability boundaries visible before a workflow uses them.

List packs:

```bash
open-lagrange pack list
```

Inspect a pack:

```bash
open-lagrange pack inspect open-lagrange.repository
```

Validate a pack:

```bash
open-lagrange pack validate open-lagrange.repository
```

## Inspect Output

Each pack report includes:

- pack manifest metadata
- capability IDs and descriptions
- input and output schemas
- risk levels
- side effect kinds
- required scopes
- required secret references
- OAuth providers
- allowed hosts
- approval requirements
- primitive usage when available

Example shape:

```json
{
  "pack_id": "open-lagrange.repository",
  "capabilities": [
    {
      "capability_ref": "open-lagrange.repository.repo.read_file",
      "risk_level": "read",
      "side_effect_kind": "filesystem_read",
      "approval_required": false
    }
  ]
}
```

## Validation

Pack validation checks for missing manifest fields, duplicate capability names, missing schemas, pack ID mismatches, and risky capabilities that do not require approval.

This keeps workflow generation and Planfile execution honest: packs advertise exactly what they can do, what they may touch, and when review is required.
