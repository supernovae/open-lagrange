import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { localComposeTemplate } from "./compose-template.js";
import { getRuntimePaths } from "./paths.js";
import type { ComposeRuntime, RuntimeProfile } from "./types.js";

const execFileAsync = promisify(execFile);

export async function detectRuntime(preferred?: "docker" | "podman"): Promise<ComposeRuntime | undefined> {
  const candidates = preferred === "docker"
    ? dockerCandidates()
    : preferred === "podman"
      ? podmanCandidates()
      : [...podmanCandidates(), ...dockerCandidates()];
  for (const candidate of candidates) {
    if (await commandWorks(candidate.command)) return candidate;
  }
  return undefined;
}

export async function writeComposeTemplate(path = getRuntimePaths().composePath): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, localComposeTemplate(), "utf8");
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
  const services = dev ? ["postgres", "rabbitmq", "hatchet-migration", "hatchet-config", "hatchet-engine", "hatchet-dashboard"] : [];
  await execFileAsync(runtime.command[0] ?? "", [...runtime.command.slice(1), "-f", composeFile, "up", "-d", ...services], { cwd: process.cwd(), env });
}

export async function composeDown(profile: RuntimeProfile): Promise<void> {
  const runtime = await detectRuntime(profile.runtimeManager === "docker" || profile.runtimeManager === "podman" ? profile.runtimeManager : undefined);
  if (!runtime) throw new Error("Docker or Podman compose was not found.");
  await execFileAsync(runtime.command[0] ?? "", [...runtime.command.slice(1), "-f", profile.composeFile ?? getRuntimePaths().composePath, "down"], { cwd: process.cwd() });
}

export async function composeLogs(profile: RuntimeProfile, service?: string): Promise<string> {
  const runtime = await detectRuntime(profile.runtimeManager === "docker" || profile.runtimeManager === "podman" ? profile.runtimeManager : undefined);
  if (!runtime) throw new Error("Docker or Podman compose was not found.");
  const { stdout } = await execFileAsync(runtime.command[0] ?? "", [...runtime.command.slice(1), "-f", profile.composeFile ?? getRuntimePaths().composePath, "logs", "--tail", "200", ...(service ? [serviceName(service)] : [])], { cwd: process.cwd(), maxBuffer: 2_000_000 });
  return stdout;
}

function podmanCandidates(): ComposeRuntime[] {
  return [
    { kind: "podman", command: ["podman", "compose"] },
    { kind: "podman", command: ["podman-compose"] },
  ];
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

function serviceName(service: string): string {
  if (service === "api") return "open-lagrange-api";
  if (service === "worker") return "open-lagrange-worker";
  if (service === "web") return "open-lagrange-web";
  if (service === "hatchet") return "hatchet-dashboard";
  return service;
}
