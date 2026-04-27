import { useEffect, useState } from "react";
import { getProjectRunStatus, getRuntimeHealth, type ProjectRunStatus, type RuntimeHealth } from "@open-lagrange/core/interface";

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
      const nextHealth = await getRuntimeHealth({ ...(input.apiUrl ? { api_url: input.apiUrl } : {}), ...(input.projectId ? { project_id: input.projectId } : {}) });
      setHealth(nextHealth);
      if (input.projectId) setProject(await getProjectRunStatus(input.projectId));
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
