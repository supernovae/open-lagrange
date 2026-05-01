import { mkdtempSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { podmanComposeCandidatesForConnections, writeComposeTemplate } from "../src/compose.js";
import { localComposeTemplate, localSearxngSettingsTemplate } from "../src/compose-template.js";
import { initRuntime } from "../src/manager.js";
import { getRuntimePaths } from "../src/paths.js";
import { BootstrapReport } from "../src/types.js";

describe("runtime compose template", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the resolved source root as the build context", () => {
    const text = localComposeTemplate({ sourceRoot: "/tmp/open-lagrange-source" });
    const parsed = YAML.parse(text) as { services?: { searxng?: { volumes?: string[] } } };

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
    expect(text).toContain("searxng:");
    expect(text).toContain("profiles:");
    expect(text).toContain("- search");
    expect(text).toContain('"8088:8080"');
    expect(text).toContain("SEARXNG_SECRET: ${OPEN_LAGRANGE_API_TOKEN:-open-lagrange-local-search}");
    expect(text).toContain("SEARXNG_SETTINGS_PATH: /etc/searxng/settings.yml");
    expect(text).toContain("/etc/searxng/settings.yml:ro");
    expect(parsed.services?.searxng?.volumes).toContain("/tmp/open-lagrange-searxng-settings.yml:/etc/searxng/settings.yml:ro");
  });

  it("enables JSON format in managed SearXNG settings", () => {
    const text = localSearxngSettingsTemplate();

    expect(text).toContain("use_default_settings: true");
    expect(text).toContain("formats:");
    expect(text).toContain("- json");
    expect(text).toContain("limiter: false");
  });

  it("keeps RabbitMQ ephemeral while preserving durable runtime volumes", () => {
    const text = localComposeTemplate({ sourceRoot: "/tmp/open-lagrange-source" });

    expect(text).toContain("user: rabbitmq");
    expect(text).toContain("hatchet-token:");
    expect(text).toContain("client.token");
    expect(text).toContain("failed to create local Hatchet client token");
    expect(text).toContain("for i in 1 2 3 4 5 6 7 8 9 10");
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
    const searxngSettings = await readFile(join(home, "searxng-settings.yml"), "utf8");
    expect(text).toContain("containers/api.Containerfile");
    expect(text).not.toContain(`context: "${home}"`);
    expect(searxngSettings).toContain("- json");
  });

  it("init can configure local SearXNG search", async () => {
    const home = mkdtempSync(join(tmpdir(), "open-lagrange-compose-"));
    vi.stubEnv("OPEN_LAGRANGE_HOME", home);

    const config = await initRuntime({ runtime: "podman", withSearch: true });

    expect(config.profiles.local?.searchProviders).toEqual([
      {
        id: "local-searxng",
        kind: "searxng",
        baseUrl: "http://localhost:8088",
        enabled: true,
        language: "en",
        categories: ["general"],
      },
    ]);
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

  it("describes local bootstrap status as structured steps", () => {
    const report = BootstrapReport.parse({
      profileName: "local",
      runtime: "podman",
      dev: false,
      configPath: "/tmp/open-lagrange/config.yaml",
      composePath: "/tmp/open-lagrange/docker-compose.yaml",
      status: {
        profileName: "local",
        mode: "local",
        ownership: "managed-by-cli",
        api: { name: "api", state: "running", url: "http://localhost:4317" },
        hatchet: { name: "hatchet", state: "running", url: "http://localhost:8080" },
        worker: { name: "worker", state: "running", url: "http://localhost:4318/healthz" },
        web: { name: "web", state: "running", url: "http://localhost:3000" },
        configPath: "/tmp/open-lagrange/config.yaml",
        warnings: [],
        errors: [],
      },
      steps: [
        { id: "profile", title: "Local profile", status: "completed" },
        { id: "hatchet-token", title: "Hatchet client token", status: "completed" },
      ],
      nextCommands: ["open-lagrange status", "open-lagrange doctor", "open-lagrange tui"],
    });

    expect(report.steps.map((step) => step.id)).toContain("hatchet-token");
  });
});
