import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { artifacts, http, policy, rateLimit, redaction, retry } from "@open-lagrange/capability-sdk/primitives";
import { stableHash } from "../../util/hash.js";
import { createCitation } from "./citations.js";
import { extractReadableContent } from "./extractor.js";
import { readFixtureSource, sourceIdForUrl } from "./fixtures.js";
import type { ResearchFetchSourceInput, ResearchFetchSourceOutput } from "./schemas.js";

export async function fetchSource(context: PrimitiveContext, input: ResearchFetchSourceInput): Promise<ResearchFetchSourceOutput> {
  const fetchedAt = new Date().toISOString();
  if (input.mode === "fixture") return fetchFixture(context, input, fetchedAt);
  const capabilityPolicy = policy.evaluateCapability(context, { risk_level: "read", side_effect_kind: "network_read", requires_approval: false });
  if (capabilityPolicy.decision === "deny") throw new Error(capabilityPolicy.reason);
  const retried = await retry.withBackoff(() => http.fetch(context, {
      url: input.url,
      timeout_ms: input.timeout_ms,
      max_bytes: input.max_bytes,
      redirect_limit: 3,
      accepted_content_types: input.accepted_content_types,
      capture_body_as_artifact: true,
      artifact_id: `source_snapshot_${stableHash({ url: input.url, fetchedAt }).slice(0, 16)}`,
      artifact_kind: "source_snapshot",
    }), {
      max_attempts: 2,
      base_delay_ms: 100,
      max_delay_ms: 1_000,
      sleep: async () => {},
  });
  const result = retried.value;
  const rateLimitInfo = rateLimit.fromHeaders(result.headers);
  const contentType = result.headers["content-type"] ?? "text/plain";
  const extracted = extractReadableContent({
    ...(contentType.includes("html") ? { html: result.text } : contentType.includes("markdown") ? { markdown: result.text } : { text: result.text }),
    url: result.url,
    max_chars: 20_000,
  }, fetchedAt);
  const citation = createCitation({ source_id: input.source_id ?? sourceIdForUrl(result.url), title: extracted.title ?? result.url, url: result.url, retrieved_at: fetchedAt });
  const textArtifactId = `source_text_${stableHash({ url: result.url, fetchedAt }).slice(0, 16)}`;
  await artifacts.write(context, {
    artifact_id: textArtifactId,
    kind: "source_text",
    title: extracted.title ?? result.url,
    summary: `Extracted text from ${result.url}.`,
    content: { ...extracted, citation, mode: input.mode },
    input_artifact_refs: result.artifact_id ? [result.artifact_id] : [],
    validation_status: "pass",
    redaction_status: "redacted",
    metadata: {
      url: input.url,
      final_url: result.url,
      mode: input.mode,
      retry_report: retried.report,
      policy_report: result.policy_report,
      capability_policy: capabilityPolicy,
      rate_limit: rateLimitInfo,
      redacted_title: redaction.redactText(extracted.title ?? result.url),
    },
  });
  return {
    source_id: citation.source_id,
    url: input.url,
    final_url: result.url,
    status_code: result.status,
    content_type: contentType,
    fetched_at: fetchedAt,
    ...(extracted.title ? { title: extracted.title } : {}),
    raw_artifact_id: result.artifact_id,
    text_artifact_id: textArtifactId,
    size_bytes: result.bytes.byteLength,
    truncated: extracted.truncated,
    warnings: extracted.warnings,
  };
}

async function fetchFixture(context: PrimitiveContext, input: ResearchFetchSourceInput, fetchedAt: string): Promise<ResearchFetchSourceOutput> {
  const fixture = readFixtureSource(input.source_id ?? input.url);
  if (!fixture) {
    return {
      source_id: input.source_id ?? sourceIdForUrl(input.url),
      url: input.url,
      fetched_at: fetchedAt,
      truncated: false,
      warnings: ["fixture_source_not_found"],
    };
  }
  const rawArtifactId = `source_snapshot_${stableHash({ fixture: fixture.source.source_id, fetchedAt }).slice(0, 16)}`;
  await artifacts.write(context, {
    artifact_id: rawArtifactId,
    kind: "source_snapshot",
    title: fixture.source.title,
    summary: `Fixture source snapshot for ${fixture.source.title}.`,
    content: { source: fixture.source, content: fixture.content, mode: "fixture" },
    validation_status: "pass",
    redaction_status: "redacted",
    metadata: { original_url: fixture.source.url, final_url: fixture.source.url, source_mode: "fixture" },
  });
  const extracted = extractReadableContent({ markdown: fixture.content, url: fixture.source.url, max_chars: 20_000 }, fetchedAt);
  const textArtifactId = `source_text_${stableHash({ fixture: fixture.source.source_id, fetchedAt }).slice(0, 16)}`;
  await artifacts.write(context, {
    artifact_id: textArtifactId,
    kind: "source_text",
    title: fixture.source.title,
    summary: `Extracted text from ${fixture.source.title}.`,
    content: { ...extracted, source_id: fixture.source.source_id, title: fixture.source.title, mode: "fixture" },
    input_artifact_refs: [rawArtifactId],
    validation_status: "pass",
    redaction_status: "redacted",
    metadata: { original_url: fixture.source.url, final_url: fixture.source.url, source_mode: "fixture" },
  });
  return {
    source_id: fixture.source.source_id,
    url: fixture.source.url,
    final_url: fixture.source.url,
    status_code: 200,
    content_type: "text/markdown",
    fetched_at: fetchedAt,
    title: fixture.source.title,
    raw_artifact_id: rawArtifactId,
    text_artifact_id: textArtifactId,
    size_bytes: Buffer.byteLength(fixture.content),
    truncated: extracted.truncated,
    warnings: extracted.warnings,
  };
}
