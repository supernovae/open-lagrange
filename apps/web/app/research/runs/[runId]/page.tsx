import ResearchRunClient from "./research-run-client";

export const dynamic = "force-dynamic";

export default async function ResearchRunPage({ params }: { readonly params: Promise<{ readonly runId: string }> }): Promise<React.ReactNode> {
  const { runId } = await params;
  return <ResearchRunClient runId={runId} />;
}
