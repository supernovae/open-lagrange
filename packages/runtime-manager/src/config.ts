import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { RuntimeConfig, RuntimeProfile, type RuntimeConfig as RuntimeConfigType, type RuntimeProfile as RuntimeProfileType } from "./types.js";
import { getRuntimePaths } from "./paths.js";

export async function loadConfig(): Promise<RuntimeConfigType> {
  const paths = getRuntimePaths();
  const text = await readFile(paths.configPath, "utf8");
  return RuntimeConfig.parse(parseConfig(text));
}

export async function saveConfig(config: RuntimeConfigType): Promise<void> {
  const paths = getRuntimePaths();
  const parsed = RuntimeConfig.parse(config);
  await mkdir(dirname(paths.configPath), { recursive: true });
  await writeFile(paths.configPath, stringifyConfig(parsed), "utf8");
}

export async function configExists(): Promise<boolean> {
  try {
    await loadConfig();
    return true;
  } catch {
    return false;
  }
}

export function defaultLocalProfile(input: {
  readonly runtime: "docker" | "podman";
  readonly composeFile?: string;
}): RuntimeProfileType {
  return RuntimeProfile.parse({
    name: "local",
    mode: "local",
    ownership: "managed-by-cli",
    apiUrl: "http://localhost:4317",
    hatchetUrl: "http://localhost:8080",
    webUrl: "http://localhost:3000",
    runtimeManager: input.runtime,
    composeFile: input.composeFile ?? getRuntimePaths().composePath,
    auth: { type: "none" },
  });
}

function parseConfig(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return parseSimpleYaml(text);
  }
}

function parseSimpleYaml(text: string): RuntimeConfigType {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  let currentProfile = "local";
  const profiles: Record<string, RuntimeProfileType> = {};
  let activeName: string | undefined;
  let activeAuth = false;
  for (const line of lines) {
    const indent = line.search(/\S/);
    const trimmed = line.trim();
    if (indent === 0 && trimmed.startsWith("currentProfile:")) currentProfile = value(trimmed);
    if (indent === 2 && trimmed.endsWith(":")) {
      activeName = trimmed.slice(0, -1);
      profiles[activeName] = {
        name: activeName,
        mode: "remote",
        ownership: "external",
        apiUrl: "http://localhost:4317",
      };
      activeAuth = false;
      continue;
    }
    if (!activeName || indent < 4) continue;
    if (indent === 4 && trimmed === "auth:") {
      activeAuth = true;
      const current = profiles[activeName];
      if (current) profiles[activeName] = { ...current, auth: { type: "none" } };
      continue;
    }
    if (indent === 4) activeAuth = false;
    const [rawKey] = trimmed.split(":");
    const key = rawKey ?? "";
    const parsedValue = value(trimmed);
    const current = profiles[activeName];
    if (!current) continue;
    if (activeAuth && current.auth) {
      profiles[activeName] = { ...current, auth: { ...current.auth, [key]: parsedValue } };
    } else {
      profiles[activeName] = { ...current, [key]: parsedValue };
    }
  }
  return RuntimeConfig.parse({ currentProfile, profiles });
}

function stringifyConfig(config: RuntimeConfigType): string {
  const chunks = [`currentProfile: ${config.currentProfile}`, "", "profiles:"];
  for (const [name, profile] of Object.entries(config.profiles)) {
    chunks.push(`  ${name}:`);
    chunks.push(`    name: ${profile.name}`);
    chunks.push(`    mode: ${profile.mode}`);
    chunks.push(`    ownership: ${profile.ownership}`);
    chunks.push(`    apiUrl: ${profile.apiUrl}`);
    if (profile.hatchetUrl) chunks.push(`    hatchetUrl: ${profile.hatchetUrl}`);
    if (profile.webUrl) chunks.push(`    webUrl: ${profile.webUrl}`);
    if (profile.runtimeManager) chunks.push(`    runtimeManager: ${profile.runtimeManager}`);
    if (profile.composeFile) chunks.push(`    composeFile: ${profile.composeFile}`);
    if (profile.auth) {
      chunks.push("    auth:");
      chunks.push(`      type: ${profile.auth.type}`);
      if (profile.auth.tokenEnv) chunks.push(`      tokenEnv: ${profile.auth.tokenEnv}`);
    }
  }
  return `${chunks.join("\n")}\n`;
}

function value(line: string): string {
  const index = line.indexOf(":");
  return line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
}
