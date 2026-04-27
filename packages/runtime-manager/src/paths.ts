import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimePaths } from "./types.js";

export function getRuntimePaths(): RuntimePaths {
  const homeDir = process.env.OPEN_LAGRANGE_HOME ?? join(homedir(), ".open-lagrange");
  return {
    homeDir,
    configPath: join(homeDir, "config.yaml"),
    composePath: join(homeDir, "docker-compose.yaml"),
    statePath: join(homeDir, "state.json"),
    logsDir: join(homeDir, "logs"),
  };
}
