import { lookup } from "node:dns/promises";
import type { PrimitiveContext, PrimitiveSecretRef } from "./context.js";
import { artifacts } from "./artifacts.js";
import { primitiveError } from "./errors.js";
import { policy, type PolicyDecisionReport } from "./policy.js";
import type { RetryReport } from "./retry.js";
import { secrets } from "./secrets.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpAuthInput {
  readonly header?: string;
  readonly scheme?: string;
  readonly secret_ref: PrimitiveSecretRef;
}

export interface HttpFetchInput {
  readonly url: string;
  readonly method?: HttpMethod;
  readonly headers?: Record<string, string>;
  readonly body?: BodyInit | null;
  readonly timeout_ms?: number;
  readonly max_bytes?: number;
  readonly redirect_limit?: number;
  readonly allowed_hosts?: readonly string[];
  readonly denied_hosts?: readonly string[];
  readonly accepted_content_types?: readonly string[];
  readonly auth?: HttpAuthInput;
  readonly capture_body_as_artifact?: boolean;
  readonly artifact_id?: string;
  readonly artifact_kind?: string;
  readonly artifact_metadata?: Record<string, unknown>;
  readonly allow_cookies?: boolean;
}

export interface HttpFetchResult {
  readonly url: string;
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Record<string, string>;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly policy_report: PolicyDecisionReport;
  readonly retry_report: RetryReport;
  readonly artifact_id?: string;
}

export async function httpFetch(context: PrimitiveContext, input: HttpFetchInput): Promise<HttpFetchResult> {
  const url = parseAllowedUrl(input.url);
  const method = input.method ?? "GET";
  enforceMethod(context, method);
  const policyReport = evaluateUrlPolicy(context, input, url, method);
  if (policyReport.decision === "deny") {
    throw primitiveError(policyReport.reason, "PRIMITIVE_POLICY_DENIED", { policy_report: policyReport });
  }

  const headers = { ...(input.headers ?? {}) };
  if (input.auth) {
    const secret = await secrets.resolveRef(context, input.auth.secret_ref);
    headers[input.auth.header ?? "Authorization"] = `${input.auth.scheme ?? "Bearer"} ${secret}`;
  }
  if (input.allow_cookies !== true) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "cookie") delete headers[key];
    }
  }

  const response = await fetchWithRedirects(context, url, {
    method,
    headers,
    ...(input.allowed_hosts ? { allowed_hosts: input.allowed_hosts } : {}),
    ...(input.denied_hosts ? { denied_hosts: input.denied_hosts } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    timeout_ms: input.timeout_ms ?? context.limits.default_timeout_ms,
    redirect_limit: input.redirect_limit ?? context.limits.default_redirect_limit,
  });
  enforceContentType(input, response);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const maxBytes = input.max_bytes ?? context.limits.default_max_bytes;
  if (bytes.byteLength > maxBytes) {
    throw primitiveError("HTTP response exceeded max_bytes.", "PRIMITIVE_RESPONSE_TOO_LARGE", {
      max_bytes: maxBytes,
      received_bytes: bytes.byteLength,
      url: url.toString(),
    });
  }
  const text = new TextDecoder().decode(bytes);
  const artifactId = input.capture_body_as_artifact === true ? input.artifact_id ?? `http_${context.trace_id}_${Date.now()}` : undefined;
  if (artifactId) {
    await artifacts.write(context, {
      artifact_id: artifactId,
      kind: input.artifact_kind ?? "http_response",
      summary: `HTTP ${response.status} ${url.hostname}`,
      content: text,
      content_type: response.headers.get("content-type") ?? "text/plain",
      validation_status: response.ok ? "pass" : "fail",
      redaction_status: "redacted",
      metadata: { ...(input.artifact_metadata ?? {}), url: url.toString(), final_url: response.url || url.toString(), status: response.status, headers: headersToObject(response.headers) },
    });
  }
  const result: HttpFetchResult = {
    url: url.toString(),
    status: response.status,
    ok: response.ok,
    headers: context.redactor.redactHeaders(headersToObject(response.headers)),
    text: context.redactor.redactText(text),
    bytes,
    policy_report: policyReport,
    retry_report: { attempts: [], max_attempts: 1, completed: true },
    ...(artifactId ? { artifact_id: artifactId } : {}),
  };
  context.logger.debug("SDK HTTP primitive completed request.", {
    url: result.url,
    status: result.status,
    request_headers: context.redactor.redactHeaders(headers),
  });
  return result;
}

export async function fetchJson<T = unknown>(context: PrimitiveContext, input: HttpFetchInput): Promise<T> {
  const result = await httpFetch(context, {
    accepted_content_types: ["application/json", "application/problem+json"],
    ...input,
  });
  return JSON.parse(result.text) as T;
}

export async function downloadToArtifact(context: PrimitiveContext, input: HttpFetchInput & { readonly artifact_id: string }): Promise<HttpFetchResult> {
  return httpFetch(context, {
    ...input,
    capture_body_as_artifact: true,
    artifact_kind: input.artifact_kind ?? "download",
  });
}

function parseAllowedUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw primitiveError("HTTP primitive received an invalid URL.", "PRIMITIVE_INVALID_INPUT", { url: value });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw primitiveError("HTTP primitive only allows http and https URLs.", "PRIMITIVE_POLICY_DENIED", { protocol: url.protocol });
  }
  return url;
}

function enforceMethod(context: PrimitiveContext, method: HttpMethod): void {
  const allowed = new Set([...(context.policy_context.allowed_http_methods ?? []), ...context.limits.allowed_http_methods]);
  if (!allowed.has(method)) {
    throw primitiveError(`HTTP method ${method} is not allowed for this capability.`, "PRIMITIVE_POLICY_DENIED", {
      method,
      allowed_methods: [...allowed],
    });
  }
}

function enforceContentType(input: HttpFetchInput, response: Response): void {
  if (!input.accepted_content_types || input.accepted_content_types.length === 0) return;
  const contentType = response.headers.get("content-type") ?? "";
  if (!input.accepted_content_types.some((accepted) => contentType.toLowerCase().includes(accepted.toLowerCase()))) {
    throw primitiveError("HTTP response content type is not accepted.", "PRIMITIVE_POLICY_DENIED", {
      content_type: contentType,
      accepted_content_types: input.accepted_content_types,
    });
  }
}

async function fetchWithRedirects(
  context: PrimitiveContext,
  url: URL,
  input: {
    readonly method: HttpMethod;
    readonly headers: Record<string, string>;
    readonly allowed_hosts?: readonly string[];
    readonly denied_hosts?: readonly string[];
    readonly body?: BodyInit | null;
    readonly timeout_ms: number;
    readonly redirect_limit: number;
  },
): Promise<Response> {
  let current = url;
  const headers = { ...input.headers };
  for (let redirect = 0; redirect <= input.redirect_limit; redirect += 1) {
    await assertDnsPolicy(context, current, input.method);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeout_ms);
    const abortListener = () => controller.abort();
    context.abort_signal?.addEventListener("abort", abortListener, { once: true });
    try {
      const response = await (context.fetch_impl ?? fetch)(current, {
        method: input.method,
        headers,
        ...(input.body !== undefined ? { body: input.body } : {}),
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        const previous = current;
        current = new URL(response.headers.get("location") ?? "", current);
        parseAllowedUrl(current.toString());
        const policyReport = evaluateUrlPolicy(context, input, current, input.method);
        if (policyReport.decision === "deny") {
          throw primitiveError(policyReport.reason, "PRIMITIVE_POLICY_DENIED", { policy_report: policyReport });
        }
        if (current.origin !== previous.origin) stripSensitiveHeaders(headers);
        continue;
      }
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw primitiveError("HTTP request timed out.", "PRIMITIVE_TIMEOUT", { timeout_ms: input.timeout_ms, url: current.toString() });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      context.abort_signal?.removeEventListener("abort", abortListener);
    }
  }
  throw primitiveError("HTTP redirect limit exceeded.", "PRIMITIVE_POLICY_DENIED", { redirect_limit: input.redirect_limit, url: url.toString() });
}

function evaluateUrlPolicy(context: PrimitiveContext, input: Pick<HttpFetchInput, "allowed_hosts" | "denied_hosts">, url: URL, method: HttpMethod): PolicyDecisionReport {
  return policy.evaluateNetwork(context, {
    url: url.toString(),
    method,
    host: url.hostname,
    ...(input.allowed_hosts ? { allowed_hosts: input.allowed_hosts } : {}),
    ...(input.denied_hosts ? { denied_hosts: input.denied_hosts } : {}),
    is_private_host: isLocalOrPrivateHost(url.hostname),
  });
}

async function assertDnsPolicy(context: PrimitiveContext, url: URL, method: HttpMethod): Promise<void> {
  if (context.fetch_impl) return;
  if (context.policy_context.allow_private_network === true || context.limits.allow_private_network) return;
  const host = normalizedHost(url.hostname);
  if (isLocalOrPrivateHost(host)) {
    const policyReport = policy.evaluateNetwork(context, {
      url: url.toString(),
      method,
      host: url.hostname,
      is_private_host: true,
    });
    throw primitiveError(policyReport.reason, "PRIMITIVE_POLICY_DENIED", { policy_report: policyReport });
  }
  const records = await lookup(host, { all: true, verbatim: true });
  const privateAddress = records.find((record) => isLocalOrPrivateHost(record.address));
  if (!privateAddress) return;
  const policyReport = policy.evaluateNetwork(context, {
    url: url.toString(),
    method,
    host: url.hostname,
    is_private_host: true,
  });
  throw primitiveError(policyReport.reason, "PRIMITIVE_POLICY_DENIED", { policy_report: policyReport, resolved_address: privateAddress.address });
}

function stripSensitiveHeaders(headers: Record<string, string>): void {
  for (const key of Object.keys(headers)) {
    const normalized = key.toLowerCase();
    if (normalized === "authorization" || normalized === "cookie" || normalized === "proxy-authorization" || normalized === "x-api-key") {
      delete headers[key];
    }
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = normalizedHost(hostname);
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const ipv4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (ipv4Mapped?.[1]) return isLocalOrPrivateHost(ipv4Mapped[1]);
  if (host.includes(":")) return false;
  const parts = host.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0 || a === 169 && b === 254 || a === 192 && b === 168) return true;
  return a === 172 && b !== undefined && b >= 16 && b <= 31;
}

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

export const http = {
  fetch: httpFetch,
  fetchJson,
  downloadToArtifact,
};
