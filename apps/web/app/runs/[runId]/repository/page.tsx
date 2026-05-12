import RepositoryRunClient from "./repository-run-client";

export const dynamic = "force-dynamic";

export default async function RepositoryRunPage({ params }: { readonly params: Promise<{ readonly runId: string }> }): Promise<React.ReactNode> {
  const { runId } = await params;
  return <RepositoryRunClient runId={runId} />;
}
