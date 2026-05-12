import { z } from "zod";
import { join } from "node:path";
import { runOutputDigestCommand, runOutputExportCommand, runOutputPacketCommand, runOutputRenderHtmlCommand, runOutputRenderPdfCommand, runOutputSelectCommand } from "@open-lagrange/core/output";
import { handleRouteError, json, parseJson, requireApiAuth, requireMutationSecurity } from "../../../http";
import { proxyApiRoute, shouldProxyApiRoute } from "../../../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OutputRequest = z.object({
  action: z.enum(["select", "digest", "packet", "render_html", "render_pdf", "export"]),
  preset: z.enum(["final_outputs", "research_packet", "developer_packet", "debug_packet", "all_safe"]).optional(),
  packet_type: z.enum(["research", "developer", "debug", "general"]).optional(),
  digest_style: z.enum(["concise", "executive", "developer", "research"]).optional(),
  artifact_id: z.string().min(1).optional(),
  artifact_ids: z.array(z.string().min(1)).optional(),
  format: z.enum(["directory", "zip", "json_manifest"]).optional(),
  deterministic: z.boolean().optional(),
  model: z.boolean().optional(),
}).strict();

export async function GET(request: Request, { params }: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    const { runId } = await params;
    const selected = await runOutputSelectCommand({ run_id: runId, preset: "final_outputs", include_model_calls: false, include_raw_logs: false, include_redacted_only: true, max_artifacts: 50 });
    return json({ run_id: runId, recommended_preset: "final_outputs", selection: selected.result, artifacts: selected.artifacts });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { runId } = await params;
    const body = await parseJson(request, OutputRequest);
    if (body.action === "select") {
      return json(await runOutputSelectCommand({ run_id: runId, preset: body.preset ?? "final_outputs", include_model_calls: false, include_raw_logs: false, include_redacted_only: true, max_artifacts: 50 }));
    }
    if (body.action === "digest") {
      return json(await runOutputDigestCommand({
        run_id: runId,
        digest_style: body.digest_style ?? "concise",
        max_words: 400,
        deterministic: body.deterministic ?? false,
        model: body.model ?? false,
      }));
    }
    if (body.action === "packet") {
      return json(await runOutputPacketCommand({
        run_id: runId,
        packet_type: body.packet_type ?? "general",
        include_timeline: true,
        include_model_calls: false,
        include_policy_reports: false,
        include_raw_logs: false,
        deterministic: body.deterministic ?? false,
        model: body.model ?? false,
      }));
    }
    if (body.action === "render_html") {
      if (!body.artifact_id) return json({ error: "MISSING_ARTIFACT_ID" }, { status: 400 });
      return json(await runOutputRenderHtmlCommand({ source_markdown_artifact_id: body.artifact_id, include_basic_styles: true }));
    }
    if (body.action === "render_pdf") {
      if (!body.artifact_id) return json({ error: "MISSING_ARTIFACT_ID" }, { status: 400 });
      return json(await runOutputRenderPdfCommand({ source_markdown_artifact_id: body.artifact_id }));
    }
    if (body.action === "export") {
      const artifactIds = body.artifact_ids ?? [];
      if (artifactIds.length === 0) return json({ error: "MISSING_ARTIFACT_IDS" }, { status: 400 });
      const format = body.format ?? "json_manifest";
      const exportPath = join(".open-lagrange", "exports", "runs", runId, `output-${Date.now().toString(36)}${format === "zip" ? ".zip" : ""}`);
      return json(await runOutputExportCommand({
        artifact_ids: artifactIds,
        format,
        include_manifest: true,
        ...(format === "json_manifest" ? {} : { output_path: exportPath }),
      }));
    }
    return json({ error: "UNSUPPORTED_OUTPUT_ACTION" }, { status: 400 });
  } catch (error) {
    return handleRouteError(error);
  }
}
