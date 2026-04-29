import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { localComposeTemplate } from "./compose-template.js";
import { getRuntimePaths } from "./paths.js";
import { resolveSourceRoot } from "./source-root.js";
import type { ComposeRuntime, RuntimeProfile } from "./types.js";

const execFileAsync = promisify(execFile);

export async function detectRuntime(preferred?: "docker" | "podman"): Promise<ComposeRuntime | undefined> {
  const podman = await podmanCandidates();
  const candidates = preferred === "docker"
    ? dockerCandidates()
    : preferred === "podman"
      ? podman
      : [...podman, ...dockerCandidates()];
  for (const candidate of candidates) {
    if (await commandWorks(candidate.command)) return candidate;
  }
  return undefined;
}

export async function writeComposeTemplate(path = getRuntimePaths().composePath): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, localComposeTemplate({ sourceRoot: resolveSourceRoot() }), "utf8");
}

export async function composeFileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function composeUp(profile: RuntimeProfile, dev = false, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const runtime = await detectRuntime(profile.runtimeManager === "docker" || profile.runtimeManager === "podman" ? profile.runtimeManager : undefined);
  if (!runtime) throw new Error("Docker or Podman compose was not found.");
  const composeFile = profile.composeFile ?? getRuntimePaths().composePath;
  if (profile.ownership === "managed-by-cli") await writeComposeTemplate(composeFile);
  const services = dev ? ["postgres", "rabbitmq", "hatchet-migration", "hatchet-config", "hatchet-engine", "hatchet-dashboard"] : [];
  try {
    if (!dev && profile.ownership === "managed-by-cli") {
      for (const service of ["open-lagrange-api", "open-lagrange-worker", "open-lagrange-web"]) {
        await execFileAsync(runtime.command[0] ?? "", [...runtime.command.slice(1), "-f", composeFile, "build", service], {
          cwd: process.cwd(),
          env: runtimeEnv(env, runtime),
          maxBuffer: 8_000_000,
        });
      }
    }
    await execFileAsync(runtime.command[0] ?? "", [...runtime.command.slice(1), "-f", composeFile, "up", "-d", ...services], { cwd: process.cwd(), env: runtimeEnv(env, runtime), maxBuffer: 8_000_000 });
  } catch (error) {
    throw enhanceComposeError(error, composeFile);
  }
}

export async function composeDown(profile: RuntimeProfile): Promise<void> {
  const runtime = await detectRuntime(profile.runtimeManager === "docker" || profile.runtimeManager === "podman" ? profile.runtimeManager : undefined);
  if (!runtime) throw new Error("Docker or Podman compose was not found.");
  await execFileAsync(runtime.command[0] ?? "", [...runtime.command.slice(1), "-f", profile.composeFile ?? getRuntimePaths().composePath, "down"], { cwd: process.cwd(), env: runtimeEnv(process.env, runtime), maxBuffer: 8_000_000 });
}

export async function composeLogs(profile: RuntimeProfile, service?: string): Promise<string> {
  const runtime = await detectRuntime(profile.runtimeManager === "docker" || profile.runtimeManager === "podman" ? profile.runtimeManager : undefined);
  if (!runtime) throw new Error("Docker or Podman compose was not found.");
  const { stdout } = await execFileAsync(runtime.command[0] ?? "", [...runtime.command.slice(1), "-f", profile.composeFile ?? getRuntimePaths().composePath, "logs", "--tail", "200", ...(service ? [serviceName(service)] : [])], { cwd: process.cwd(), env: runtimeEnv(process.env, runtime), maxBuffer: 2_000_000 });
  return stdout;
}

async function podmanCandidates(): Promise<ComposeRuntime[]> {
  return [
    ...podmanComposeCandidatesForConnections(await listPodmanConnections()),
    { kind: "podman", command: ["podman", "compose"] },
    { kind: "podman", command: ["podman-compose"] },
  ];
}

interface PodmanConnectionInfo {
  readonly Name?: string;
  readonly URI?: string;
  readonly Identity?: string;
  readonly Default?: boolean;
  readonly ReadWrite?: boolean;
}

export function podmanComposeCandidatesForConnections(connections: readonly PodmanConnectionInfo[]): ComposeRuntime[] {
  const rootlessMachine = connections.find((connection) =>
    connection.ReadWrite !== false
    && typeof connection.Name === "string"
    && typeof connection.URI === "string"
    && connection.URI.includes("/run/user/")
  );
  const defaultRootful = connections.find((connection) => connection.Default && connection.URI?.includes("/run/podman/podman.sock"));
  if (!rootlessMachine || !defaultRootful) return [];
  if (!rootlessMachine.URI) return [];
  const env = {
    CONTAINER_HOST: rootlessMachine.URI,
    ...(rootlessMachine.Identity ? { CONTAINER_SSHKEY: rootlessMachine.Identity } : {}),
  };
  return [
    { kind: "podman", command: ["podman", "compose"], env },
    { kind: "podman", command: ["podman-compose"], env },
  ];
}

async function listPodmanConnections(): Promise<readonly PodmanConnectionInfo[]> {
  try {
    const { stdout } = await execFileAsync("podman", ["system", "connection", "list", "--format", "json"], { timeout: 3000 });
    const parsed = JSON.parse(stdout) as unknown;
    return Array.isArray(parsed) ? parsed as PodmanConnectionInfo[] : [];
  } catch {
    return [];
  }
}

function dockerCandidates(): ComposeRuntime[] {
  return [
    { kind: "docker", command: ["docker", "compose"] },
    { kind: "docker", command: ["docker-compose"] },
  ];
}

async function commandWorks(command: readonly string[]): Promise<boolean> {
  try {
    await execFileAsync(command[0] ?? "", [...command.slice(1), "version"], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function runtimeEnv(base: NodeJS.ProcessEnv, runtime: ComposeRuntime): NodeJS.ProcessEnv {
  return { ...base, ...(runtime.env ?? {}) };
}

function enhanceComposeError(error: unknown, composeFile: string): Error {
  if (!(error instanceof Error)) return new Error(String(error));
  const composeError = error as Error & { readonly stderr?: unknown };
  const stderr = typeof composeError.stderr === "string"
    ? composeError.stderr
    : "";
  if (!stderr.includes("Dockerfile not found") && !stderr.includes("Containerfile")) return error;
  const message = [
    `Compose startup failed while building Open Lagrange containers from ${composeFile}.`,
    "The generated compose file should point at the repository source root.",
    "Run `open-lagrange init --runtime podman` to regenerate it, or set OPEN_LAGRANGE_SOURCE_ROOT=/path/to/open-lagrange.",
    "",
    stderr,
  ].join("\n");
  return Object.assign(new Error(message), { cause: error });
}

function serviceName(service: string): string {
  if (service === "api") return "open-lagrange-api";
  if (service === "worker") return "open-lagrange-worker";
  if (service === "web") return "open-lagrange-web";
  if (service === "hatchet") return "hatchet-dashboard";
  return service;
}
