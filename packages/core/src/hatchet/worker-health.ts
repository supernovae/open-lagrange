import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

export interface WorkerHealthState {
  readonly name: string;
  readonly status: "starting" | "running";
  readonly workflows_registered: number;
  readonly started_at: string;
  readonly updated_at: string;
}

export interface WorkerHealthServer {
  readonly server: Server;
  readonly url: string;
  readonly setRunning: (workflowsRegistered: number) => void;
}

export interface WorkerHealthController {
  readonly snapshot: () => WorkerHealthState;
  readonly setRunning: (workflowsRegistered: number) => void;
}

export function createWorkerHealthController(input: {
  readonly name: string;
  readonly workflowsRegistered?: number;
  readonly now?: () => Date;
}): WorkerHealthController {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();
  let state: WorkerHealthState = {
    name: input.name,
    status: "starting",
    workflows_registered: input.workflowsRegistered ?? 0,
    started_at: startedAt,
    updated_at: startedAt,
  };
  return {
    snapshot: () => state,
    setRunning: (workflowsRegistered: number) => {
      state = {
        ...state,
        status: "running",
        workflows_registered: workflowsRegistered,
        updated_at: now().toISOString(),
      };
    },
  };
}

export function startWorkerHealthServer(input: {
  readonly name: string;
  readonly workflowsRegistered?: number;
  readonly host?: string;
  readonly port?: number;
  readonly now?: () => Date;
}): WorkerHealthServer {
  const health = createWorkerHealthController({
    name: input.name,
    ...(input.workflowsRegistered === undefined ? {} : { workflowsRegistered: input.workflowsRegistered }),
    ...(input.now ? { now: input.now } : {}),
  });
  const server = createServer((request, response) => respond(request, response, health.snapshot));
  const host = input.host ?? process.env.OPEN_LAGRANGE_WORKER_HEALTH_HOST ?? "0.0.0.0";
  const port = input.port ?? Number.parseInt(process.env.OPEN_LAGRANGE_WORKER_HEALTH_PORT ?? "4318", 10);
  server.listen(port, host);
  return {
    server,
    url: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    setRunning: health.setRunning,
  };
}

function respond(request: IncomingMessage, response: ServerResponse, state: () => WorkerHealthState): void {
  if (request.method !== "GET" || !isHealthPath(request.url ?? "/")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  const body = state();
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function isHealthPath(path: string): boolean {
  return path === "/" || path === "/healthz" || path === "/v1/runtime/worker/status";
}
