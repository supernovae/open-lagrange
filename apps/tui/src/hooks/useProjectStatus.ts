import { useEffect, useState } from "react";
import type { ProjectRunStatus, RuntimeHealth } from "@open-lagrange/core/interface";
import { runCoreDoctor, type DoctorReport } from "@open-lagrange/core/doctor";
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
      const doctor = await runCoreDoctor();
      setHealth({
        profile: runtimeStatus.profileName || doctor.profile_name,
        api: runtimeStatus.api.state === "running" ? "up" : runtimeStatus.api.state === "unreachable" ? "down" : "unknown",
        worker: runtimeStatus.worker?.state === "running" ? "up" : "unknown",
        hatchet: runtimeStatus.hatchet?.state === "running" ? "up" : "unknown",
        packs: runtimeStatus.registeredPacks?.length ?? doctorPackCount(doctor),
        model: doctorCheck(doctor, "model_credential") === "pass" || runtimeStatus.modelProvider?.state === "running" ? "configured" : "not_configured",
        remote_auth: runtimeStatus.credentials?.remoteAuth.state === "running" ? "configured" : "missing",
        secret_provider: runtimeStatus.credentials?.secretProvider ?? doctorSecretProvider(doctor),
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

function doctorCheck(report: DoctorReport, id: string): "pass" | "warn" | "fail" | undefined {
  return report.checks.find((check) => check.id === id)?.status;
}

function doctorPackCount(report: DoctorReport): number {
  const summary = report.checks.find((check) => check.id === "pack_registry")?.summary ?? "";
  const match = /^(\d+)/.exec(summary);
  return match ? Number(match[1]) : 0;
}

function doctorSecretProvider(report: DoctorReport): string {
  return doctorCheck(report, "secret_provider") === "pass" ? "configured" : "env";
}
