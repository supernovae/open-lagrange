# Web Run Console

The web Run Console lives at:

```text
/runs/:runId
```

Plan Builder `Run Now` creates a Durable Run through `POST /api/runs` and navigates to the console. The page streams canonical `RunEventEnvelope` projections through `GET /api/runs/:runId/events/stream` and keeps polling as a fallback.

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
- `GET /api/runs/:runId/events/stream`
- `POST /api/runs/:runId/resume`
- `POST /api/runs/:runId/nodes/:nodeId/retry`
- `POST /api/runs/:runId/cancel`
- `GET /api/runs/:runId/ui-state`
- `PUT /api/runs/:runId/ui-state`
- `POST /api/runs/:runId/approvals/:approvalId/approve`
- `POST /api/runs/:runId/approvals/:approvalId/reject`

The browser uses fetch-based SSE parsing so bearer-token auth headers work. The header shows live state as connected, reconnecting, polling fallback, or disconnected. The bearer token is kept in session storage for manual browser sessions. Tab and selection state is stored in browser storage and synced to backend UI state for cross-surface continuity. UI state is never workflow state.
