import { useEffect, useState } from "react";
import type { ProjectRunStatus, RuntimeHealth } from "@open-lagrange/core/interface";
import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import { getRuntimeStatus } from "@open-lagrange/runtime-manager";

export function useProjectStatus(input: {
  readonly projectId?: string;
  readonly pollIntervalMs: number;
  readonly apiUrl?: string;
}): {
  readonly project?: ProjectRunStatus;
  readonly health?: RuntimeHealth;
  readonly isLoading: boolean;
  readonly lastError?: string;
  readonly refresh: () => Promise<void>;
} {
  const [project, setProject] = useState<ProjectRunStatus | undefined>();
  const [health, setHealth] = useState<RuntimeHealth | undefined>();
  const [isLoading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | undefined>();

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const runtimeStatus = await getRuntimeStatus();
      setHealth({
        profile: runtimeStatus.profileName,
        api: runtimeStatus.api.state === "running" ? "up" : runtimeStatus.api.state === "unreachable" ? "down" : "unknown",
        worker: runtimeStatus.worker?.state === "running" ? "up" : "unknown",
        hatchet: runtimeStatus.hatchet?.state === "running" ? "up" : "unknown",
        packs: runtimeStatus.registeredPacks?.length ?? 0,
        model: runtimeStatus.modelProvider?.state === "running" ? "configured" : "not_configured",
        remote_auth: runtimeStatus.credentials?.remoteAuth.state === "running" ? "configured" : "missing",
        secret_provider: runtimeStatus.credentials?.secretProvider ?? "env",
      });
      if (input.projectId) setProject(await (await createPlatformClientFromCurrentProfile()).getProjectStatus(input.projectId) as ProjectRunStatus);
      setLastError(undefined);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Status refresh failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), input.pollIntervalMs);
    return () => clearInterval(timer);
  }, [input.projectId, input.pollIntervalMs, input.apiUrl]);

  return {
    ...(project ? { project } : {}),
    ...(health ? { health } : {}),
    isLoading,
    ...(lastError ? { lastError } : {}),
    refresh,
  };
}
