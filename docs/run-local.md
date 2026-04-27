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
   `.env.example`. For the local server, keep:

   ```bash
   HATCHET_CLIENT_HOST_PORT=localhost:7077
   HATCHET_CLIENT_TLS_STRATEGY=none
   ```

4. Start the Open Lagrange worker:

   ```bash
   npm run dev:worker
   ```

5. Submit the demo workflow run:

   ```bash
   npm run cli -- run-demo
   ```

6. Check status manually:

   ```bash
   npm run cli -- status <project-id-or-run-id>
   ```

## Known Limits

- Status and approval stores are in memory for this slice.
- Approval-required tasks return `requires_approval`; resume handling is a
  later workflow.
- MCP endpoint execution is mocked and sandboxed.
- No browser UI is included.
