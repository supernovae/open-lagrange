import RunConsoleClient from "./run-console-client";

export default async function RunPage({ params }: { readonly params: Promise<{ readonly runId: string }> }): Promise<React.ReactNode> {
  const { runId } = await params;
  return <RunConsoleClient runId={runId} />;
}
