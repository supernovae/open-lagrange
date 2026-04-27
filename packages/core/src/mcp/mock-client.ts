import type { DelegationContext } from "../schemas/delegation.js";
import { findTrustedCapability } from "./mock-registry.js";

export interface MockMcpExecutionRequest {
  readonly endpoint_id: string;
  readonly capability_name: string;
  readonly arguments: Record<string, unknown>;
  readonly idempotency_key: string;
  readonly delegation_context: DelegationContext;
}

export type MockMcpExecutionResult =
  | { readonly status: "ok"; readonly message: string; readonly result: unknown }
  | { readonly status: "error"; readonly message: string };

export async function executeMockMcpEndpoint(input: MockMcpExecutionRequest): Promise<MockMcpExecutionResult> {
  const trusted = findTrustedCapability(input.endpoint_id, input.capability_name);
  if (!trusted) return { status: "error", message: "Unknown trusted MCP endpoint" };
  const parsed = trusted.argument_schema.safeParse(input.arguments);
  if (!parsed.success) return { status: "error", message: parsed.error.message };

  if (input.capability_name === "search_docs") {
    return {
      status: "ok",
      message: "Search completed",
      result: {
        results: [{
          title: "Open Lagrange README",
          url: "mcp://knowledge/search_docs/readme",
          summary: "Open Lagrange reconciles typed cognitive artifacts through policy-gated endpoint execution.",
        }],
      },
    };
  }

  if (input.capability_name === "read_file") {
    return {
      status: "ok",
      message: "Read completed",
      result: {
        path: String(parsed.data.path),
        content: "# Open Lagrange\n\nDurable reconciliation around non-deterministic cognitive functions.",
      },
    };
  }

  if (input.capability_name === "draft_readme_summary") {
    return {
      status: "ok",
      message: "Summary drafted",
      result: {
        title: String(parsed.data.title),
        content: `Open Lagrange is a TypeScript framework that validates cognitive artifacts, applies policy, and executes trusted endpoint intents through durable reconciliation. ${String(parsed.data.source_summary)}`,
      },
    };
  }

  return {
    status: "ok",
    message: "Sandboxed write simulated",
    result: {
      path: String(parsed.data.path),
      bytes_written: String(parsed.data.content).length,
      simulated: true,
    },
  };
}
