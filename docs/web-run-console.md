# Web Run Console

The web Run Console lives at:

```text
/runs/:runId
```

Plan Builder `Run Now` creates a run through `POST /api/runs` and navigates to the console. The page streams live events through `GET /api/runs/:runId/stream` and keeps manual refresh as a fallback.

Tabs:

- Overview
- Timeline
- Artifacts
- Approvals
- Model Calls
- Logs
- Plan

API routes:

- `POST /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/events`
- `GET /api/runs/:runId/stream`
- `POST /api/runs/:runId/resume`
- `POST /api/runs/:runId/nodes/:nodeId/retry`
- `POST /api/runs/:runId/cancel`
- `GET /api/runs/:runId/ui-state`
- `PUT /api/runs/:runId/ui-state`
- `POST /api/runs/:runId/approvals/:approvalId/approve`
- `POST /api/runs/:runId/approvals/:approvalId/reject`

The page stores the bearer token in the same `open-lagrange-api-token` local storage key used by the workbench. Tab and selection state is stored in browser storage and synced to backend UI state for cross-surface continuity.
