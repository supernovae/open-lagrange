import { describe, expect, it } from "vitest";
import { createTestPackContext } from "../src/testing.js";
import {
  artifacts,
  createPrimitiveContext,
  http,
  rateLimit,
  retry,
  secrets,
  type PrimitiveContext,
} from "../src/primitives/index.js";

describe("capability SDK primitives", () => {
  it("rejects non-http URLs", async () => {
    await expect(http.fetch(baseContext(), { url: "file:///etc/passwd" })).rejects.toMatchObject({
      primitive_code: "PRIMITIVE_POLICY_DENIED",
    });
  });

  it("rejects localhost and private hosts by default", async () => {
    await expect(http.fetch(baseContext(), { url: "http://localhost:4317/healthz" })).rejects.toMatchObject({
      primitive_code: "PRIMITIVE_POLICY_DENIED",
    });
    await expect(http.fetch(baseContext(), { url: "http://169.254.169.254/latest/meta-data" })).rejects.toMatchObject({
      primitive_code: "PRIMITIVE_POLICY_DENIED",
    });
  });

  it("enforces max response bytes", async () => {
    const context = baseContext({
      fetch_impl: async () => new Response("0123456789", { status: 200 }),
    });

    await expect(http.fetch(context, { url: "https://api.example.test/data", max_bytes: 4 })).rejects.toMatchObject({
      primitive_code: "PRIMITIVE_RESPONSE_TOO_LARGE",
    });
  });

  it("redacts Authorization headers from HTTP diagnostics", async () => {
    const debug: unknown[] = [];
    const context = baseContext({
      fetch_impl: async () => new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", authorization: "Bearer server-token" },
      }),
      secret_manager: {
        async resolveSecret() {
          return "raw-secret-token";
        },
      },
      logger: {
        debug(_message, metadata) {
          debug.push(metadata);
        },
        info() {},
        warn() {},
        error() {},
      },
    });

    const result = await http.fetch(context, {
      url: "https://api.example.test/data",
      auth: { secret_ref: { name: "provider.default" } },
    });

    expect(JSON.stringify(result)).not.toContain("raw-secret-token");
    expect(JSON.stringify(debug)).not.toContain("raw-secret-token");
    expect(JSON.stringify(debug)).toContain("[REDACTED]");
  });

  it("writes captured HTTP responses as artifacts", async () => {
    const written: unknown[] = [];
    const context = baseContext({
      artifact_store: {
        async write(artifact) {
          written.push(artifact);
        },
      },
      fetch_impl: async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    const result = await http.fetch(context, {
      url: "https://api.example.test/data",
      capture_body_as_artifact: true,
      artifact_id: "artifact_http_test",
      max_bytes: 1000,
    });

    expect(result.artifact_id).toBe("artifact_http_test");
    expect(written).toHaveLength(1);
    expect(JSON.stringify(written[0])).toContain("artifact_http_test");
    expect(JSON.stringify(written[0])).toContain("produced_by_pack_id");
  });

  it("parses Retry-After and reports retry waits", async () => {
    const info = rateLimit.fromHeaders({ "retry-after": "2", "x-ratelimit-remaining": "0" });
    const delays: number[] = [];
    let calls = 0;
    const result = await retry.withBackoff(
      async () => {
        calls += 1;
        return calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : new Response("ok", { status: 200 });
      },
      { max_attempts: 2, base_delay_ms: 10, max_delay_ms: 5000, sleep: async (delay) => { delays.push(delay); } },
    );

    expect(rateLimit.shouldWait(info)).toBe(true);
    expect(rateLimit.toRetryDelay(info)).toBe(2000);
    expect(result.report.attempts[0]?.delay_ms).toBe(2000);
    expect(delays).toEqual([2000]);
  });

  it("records artifact lineage", async () => {
    const written: unknown[] = [];
    const context = baseContext({
      artifact_store: {
        async write(artifact) {
          written.push(artifact);
        },
      },
    });

    const summary = await artifacts.write(context, {
      artifact_id: "artifact_lineage_test",
      kind: "test",
      summary: "lineage",
      input_artifact_refs: ["artifact_input"],
    });

    expect(summary.lineage.produced_by_pack_id).toBe("pack.test");
    expect(summary.lineage.produced_by_capability_id).toBe("capability.test");
    expect(summary.lineage.input_artifact_refs).toEqual(["artifact_input"]);
    expect(written).toHaveLength(1);
  });

  it("resolves secret refs without logging raw values", async () => {
    const logs: unknown[] = [];
    const context = baseContext({
      secret_manager: {
        async resolveSecret() {
          return "raw-secret-value";
        },
      },
      logger: {
        debug(_message, metadata) {
          logs.push(metadata);
        },
        info() {},
        warn() {},
        error() {},
      },
    });

    const value = await secrets.resolveRef(context, { provider: "os-keychain", name: "provider.default", scope: "profile" });

    expect(value).toBe("raw-secret-value");
    expect(JSON.stringify(logs)).not.toContain("raw-secret-value");
  });
});

function baseContext(overrides: Partial<PrimitiveContext> = {}): PrimitiveContext {
  return createPrimitiveContext(createTestPackContext({
    ...(overrides.logger ? { logger: overrides.logger } : {}),
  }), {
    pack_id: "pack.test",
    capability_id: "capability.test",
    plan_id: "plan.test",
    node_id: "node.test",
    policy_context: {
      allowed_hosts: ["api.example.test"],
      allowed_http_methods: ["GET"],
    },
    ...(overrides.artifact_store ? { artifact_store: overrides.artifact_store } : {}),
    ...(overrides.secret_manager ? { secret_manager: overrides.secret_manager } : {}),
    ...(overrides.fetch_impl ? { fetch_impl: overrides.fetch_impl } : {}),
    ...(overrides.limits ? { limits: overrides.limits } : {}),
  });
}
