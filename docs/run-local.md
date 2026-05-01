# Run Open Lagrange Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start Hatchet locally:

   ```bash
   curl -fsSL https://install.hatchet.run/install.sh | bash
   hatchet server start
   ```

3. Open the Hatchet dashboard, create an API token, and configure `.env` from
   `.env.example`. For local runs, keep:

   ```bash
   HATCHET_CLIENT_HOST_PORT=localhost:7077
   HATCHET_CLIENT_TLS_STRATEGY=none
   OPEN_LAGRANGE_DB_DIALECT=sqlite
   OPEN_LAGRANGE_SQLITE_PATH=./runs/open-lagrange.sqlite
   ```

4. Start the Open Lagrange worker:

   ```bash
   npm run dev:worker
   ```

5. Submit from the CLI:

   ```bash
   open-lagrange submit "Create a short README summary for this repository."
   open-lagrange status <project-id-or-run-id>
   ```

6. Start the web app:

   ```bash
   npm run dev:web
   ```

7. Submit through the web API:

   ```bash
   curl -s http://localhost:3000/api/jobs \
     -H 'content-type: application/json' \
     -d '{"goal":"Create a short README summary for this repository."}'
   ```

8. Approve or reject a task:

   ```bash
   open-lagrange approve <task-run-id> --reason "Approved for demo"
   open-lagrange reject <task-run-id> --reason "Rejected for demo"
   ```

Approval starts a deterministic continuation workflow run. Rejection records the
decision and leaves the task yielded safely.

9. Run the Repository Task Pack:

   ```bash
   open-lagrange repo run \
     --repo . \
     --goal "Add a short Repository Task Pack note to the README."
   open-lagrange repo status <task-run-id>
   ```

10. Apply a repository patch explicitly:

   ```bash
   open-lagrange repo run \
     --repo . \
     --goal "Add a short Repository Task Pack note to the README." \
     --apply
   open-lagrange repo diff <task-run-id>
   open-lagrange repo review <task-run-id>
   ```

## Known Limits

- SQLite is the local persistence implementation; Postgres is prepared by the
  repository boundary but not implemented yet.
- MCP endpoint execution is mocked and sandboxed.
- The web UI is intentionally minimal.
- Project-level status after continuation is derived from task status records;
  a later slice should add a project continuation or aggregation workflow.
- Repository patch approval records a review decision and starts a deterministic
  repository continuation workflow run. The continuation uses the persisted
  patch plan, expected hashes, workspace policy, and verification command IDs;
  approval does not mutate the patch.
