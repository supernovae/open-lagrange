import { readArtifactPayload, type ArtifactSummary } from "../../artifacts/index.js";

export interface BundleEntry {
  readonly artifact: ArtifactSummary;
  readonly content: Buffer | string;
  readonly file_name: string;
}

export function bundleEntries(artifacts: readonly ArtifactSummary[], indexPath?: string): readonly BundleEntry[] {
  return artifacts.map((artifact) => {
    const payload = readArtifactPayload(artifact.artifact_id, indexPath);
    return {
      artifact,
      content: payload?.bytes ?? serializeStructuredContent(payload?.content, artifact.content_type),
      file_name: fileNameForArtifact(artifact),
    };
  });
}

export function fileNameForArtifact(artifact: ArtifactSummary): string {
  const extension = extensionForContentType(artifact.content_type);
  return `${artifact.kind}/${safeName(artifact.artifact_id)}.${extension}`;
}

export function serializeBundleContent(content: Buffer | string): Buffer | string {
  return content;
}

function serializeStructuredContent(content: unknown, contentType?: string): string {
  if (typeof content === "string") return content;
  if (content === undefined) return "";
  if (contentType?.includes("json")) return JSON.stringify(content, null, 2);
  return JSON.stringify(content, null, 2);
}

function extensionForContentType(contentType: string | undefined): string {
  if (contentType?.includes("markdown")) return "md";
  if (contentType?.includes("html")) return "html";
  if (contentType?.includes("pdf")) return "pdf";
  if (contentType?.includes("zip")) return "zip";
  if (contentType?.includes("patch")) return "patch";
  if (contentType?.includes("plain")) return "txt";
  return "json";
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
