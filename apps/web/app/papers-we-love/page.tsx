const papers = [
  {
    area: "Joint cognitive systems",
    title: "The systems thinking behind resilient human-AI work",
    body: "Work we return to when thinking about teams, tools, operators, safety, feedback, and the shape of dependable intelligence systems.",
    sources: [
      { label: "What to Make Sense of in the Era of LLM?", href: "https://arxiv.org/abs/2603.08604" },
      { label: "Lost in the Middle", href: "https://arxiv.org/abs/2307.03172" },
      { label: "Routesplain", href: "https://arxiv.org/abs/2511.09373" },
    ],
  },
  {
    area: "Retrieval and knowledge",
    title: "RAG, graph context, provenance, and freshness",
    body: "Papers and essays that influence how Synesis thinks about grounding, citations, source quality, authorization, and evidence that can be inspected.",
    sources: [
      { label: "RAG for Knowledge-Intensive NLP", href: "https://arxiv.org/abs/2005.11401" },
      { label: "HyDE", href: "https://arxiv.org/abs/2212.10496" },
      { label: "Reciprocal Rank Fusion", href: "https://dl.acm.org/doi/10.1145/1540270.1540430" },
    ],
  },
  {
    area: "Agent evaluation",
    title: "Measuring useful agent behavior",
    body: "Research on task completion, critique, regression testing, judge reliability, and the hard parts of knowing whether agentic software is getting better.",
    sources: [
      { label: "ARES", href: "https://arxiv.org/abs/2311.09476" },
      { label: "FActScore", href: "https://arxiv.org/abs/2305.14251" },
      { label: "SWE-agent", href: "https://openreview.net/forum?id=30hggYAY0Z" },
    ],
  },
  {
    area: "Security",
    title: "Prompt injection, trust boundaries, and content hygiene",
    body: "References that inform the trust-packet model, untrusted evidence handling, index-time scanning, and the boring controls that make open-ended systems safer.",
    sources: [
      { label: "Spotlighting", href: "https://arxiv.org/abs/2403.14720" },
      { label: "CaMeL", href: "https://arxiv.org/abs/2503.18813" },
      { label: "TrustRAG", href: "https://arxiv.org/abs/2501.00879" },
    ],
  },
  {
    area: "Developer tools",
    title: "Coding agents, context, and working memory",
    body: "Notes on code retrieval, project understanding, tool use, patch review, and the developer experience we want around Claude Code, opencode, and IDE workflows.",
    sources: [
      { label: "SWE-agent", href: "https://openreview.net/forum?id=30hggYAY0Z" },
      { label: "Qwen3-Coder technical report", href: "https://arxiv.org/html/2603.00729v1" },
      { label: "OpenHands critic pattern", href: "https://docs.openhands.dev/sdk/guides/critic" },
    ],
  },
  {
    area: "Operations",
    title: "Model serving, observability, and human review",
    body: "Material we like on self-hosted model platforms, runtime governance, tracing, quality loops, and keeping people in control of consequential changes.",
    sources: [
      { label: "Instruction hierarchy", href: "https://arxiv.org/abs/2404.13208" },
      { label: "BEAVER", href: "https://arxiv.org/abs/2512.05439" },
      { label: "OWASP LLM Top 10", href: "https://owasp.org/www-project-top-10-for-large-language-model-applications/" },
    ],
  },
];

export default function PapersWeLovePage(): React.ReactNode {
  return (
    <main className="pageShell">
      <nav className="nav pageNav" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Kybern home">
          <span className="brandMark">K</span>
          <span>Kybern</span>
        </a>
        <div className="navLinks">
          <a href="/#synesis">Synesis</a>
          <a href="/#open-lagrange">Open Lagrange</a>
          <a href="/papers-we-love">Papers We Love</a>
          <a href="/about">About</a>
          <a href="/#notes">Notes</a>
        </div>
      </nav>

      <section className="subpageHero">
        <p className="eyebrow">Papers We Love</p>
        <h1>Research, essays, and systems ideas we keep coming back to.</h1>
        <p className="lede">
          This is the Kybern reading shelf: not a product feature list, just the papers and references we like
          enough to share because they shape how we think about Synesis, Open Lagrange, and human-centered AI systems.
        </p>
      </section>

      <section className="paperGrid" aria-label="Papers We Love categories">
        {papers.map((paper) => (
          <article className="paperCard" key={paper.title}>
            <p className="paperMeta">{paper.area}</p>
            <h3>{paper.title}</h3>
            <p>{paper.body}</p>
            <div className="paperLinks" aria-label={`${paper.area} references`}>
              {paper.sources.map((source) => (
                <a href={source.href} key={source.href} rel="noreferrer" target="_blank">{source.label}</a>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
