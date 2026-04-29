import { mkdtempSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { podmanComposeCandidatesForConnections, writeComposeTemplate } from "../src/compose.js";
import { localComposeTemplate } from "../src/compose-template.js";
import { initRuntime } from "../src/manager.js";
import { getRuntimePaths } from "../src/paths.js";

describe("runtime compose template", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the resolved source root as the build context", () => {
    const text = localComposeTemplate({ sourceRoot: "/tmp/open-lagrange-source" });

    expect(text).toContain('context: "/tmp/open-lagrange-source"');
    expect(text).toContain("dockerfile: containers/api.Containerfile");
    expect(text).toContain("dockerfile: containers/worker.Containerfile");
    expect(text).toContain("dockerfile: containers/web.Containerfile");
    expect(text).toContain('"4318:4318"');
    expect(text).toContain("OPEN_LAGRANGE_WORKER_HEALTH_PORT");
    expect(text).toContain("OPEN_LAGRANGE_WORKER_HEALTH_URL: http://open-lagrange-worker:4318/healthz");
    expect(text).toContain("OPEN_LAGRANGE_MODEL_PROVIDER");
    expect(text).toContain("OPEN_LAGRANGE_MODEL_HIGH");
    expect(text).toContain("OPENAI_BASE_URL");
  });

  it("keeps RabbitMQ ephemeral while preserving durable runtime volumes", () => {
    const text = localComposeTemplate({ sourceRoot: "/tmp/open-lagrange-source" });

    expect(text).toContain("user: rabbitmq");
    expect(text).toContain("hatchet-token:");
    expect(text).toContain("client.token");
    expect(text).not.toContain("hatchet_rabbitmq_data");
    expect(text).not.toContain("/var/lib/rabbitmq");
    expect(text).toContain("hatchet_postgres_data:/var/lib/postgresql/data");
    expect(text).toContain("open_lagrange_data:/data");
    expect(text).toContain("hatchet_config:");
    expect(text).toContain("hatchet_certs:");
  });

  it("init writes a compose file that does not build from runtime home", async () => {
    const home = mkdtempSync(join(tmpdir(), "open-lagrange-compose-"));
    vi.stubEnv("OPEN_LAGRANGE_HOME", home);

    await initRuntime({ runtime: "podman" });

    const text = await readFile(getRuntimePaths().composePath, "utf8");
    expect(text).toContain("containers/api.Containerfile");
    expect(text).not.toContain(`context: "${home}"`);
  });

  it("reports a clear error when the source root is invalid", async () => {
    const home = mkdtempSync(join(tmpdir(), "open-lagrange-compose-"));
    const invalidSource = join(home, "missing-source");
    await mkdir(invalidSource, { recursive: true });
    vi.stubEnv("OPEN_LAGRANGE_SOURCE_ROOT", invalidSource);

    await expect(writeComposeTemplate(join(home, "docker-compose.yaml"))).rejects.toThrow(/OPEN_LAGRANGE_SOURCE_ROOT/);
  });

  it("prefers a rootless Podman machine connection when the default connection is rootful", () => {
    const candidates = podmanComposeCandidatesForConnections([
      {
        Name: "podman-machine-default",
        URI: "ssh://core@127.0.0.1:60000/run/user/501/podman/podman.sock",
        Identity: "/tmp/machine-key",
        Default: false,
        ReadWrite: true,
      },
      {
        Name: "podman-machine-default-root",
        URI: "ssh://root@127.0.0.1:60000/run/podman/podman.sock",
        Default: true,
        ReadWrite: true,
      },
    ]);

    expect(candidates[0]?.command).toEqual(["podman", "compose"]);
    expect(candidates[0]?.env).toEqual({
      CONTAINER_HOST: "ssh://core@127.0.0.1:60000/run/user/501/podman/podman.sock",
      CONTAINER_SSHKEY: "/tmp/machine-key",
    });
    expect(candidates[1]?.command).toEqual(["podman-compose"]);
  });
});
