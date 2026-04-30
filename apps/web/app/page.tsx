const platformHighlights = [
  {
    title: "Open WebUI chat",
    body: "A planner-first chat surface for knowledge work, grounded answers, clarification, plan approval, evidence-gated writing, and multi-axis critic review.",
  },
  {
    title: "Coder-side tools",
    body: "Claude Code, opencode, IDE clients, and other coding tools can connect to the coder endpoint and MCP tools while sharing the same organizational intelligence layer.",
  },
  {
    title: "Graph-native knowledge",
    body: "NornicDB stores documents, code, symbols, relationships, provenance, authorization metadata, and BGE-M3 embeddings as one retrieval graph.",
  },
  {
    title: "Operator control",
    body: "Model registry, provider governance, RAG ingestion, security review, traces, usage, and quality feedback are managed from the Synesis admin surface.",
  },
];

const developerExperience = [
  "Open WebUI for planner-governed chat and reviewed answers",
  "Claude Code, opencode, and IDE assistants for coder-side work",
  "MCP tools for shared knowledge, taxonomy, and quality gates",
  "Open Lagrange for plans, approvals, artifacts, and repository tasks",
];

const showcase = [
  {
    title: "One platform, multiple front doors",
    body: "Chat users get a guided Open WebUI experience. Developers keep their native coding tools. Operators govern models, data, and review policy from one admin plane.",
  },
  {
    title: "Knowledge that follows the work",
    body: "The same graph-backed retrieval, provenance, freshness, and authorization rules can support product research, internal documentation, and coder workflows.",
  },
  {
    title: "Execution stays reviewable",
    body: "Open Lagrange complements Synesis by turning tool-assisted work into typed plans, continuation boundaries, artifacts, repository diffs, and explicit human decisions.",
  },
];

const fieldNotes = [
  {
    eyebrow: "Architecture",
    title: "Why Synesis moved retrieval into a content graph",
    body: "The current RAG path starts with vector seeds, then expands across deterministic code and document relationships. This gives coder and planner workflows local structural context without depending on LLM-generated graph edges.",
  },
  {
    eyebrow: "Security",
    title: "Graph expansion has to obey the same auth boundary",
    body: "Schema v19 carries visibility, tenant, owner, session, ACL group, and authz object metadata onto chunks and structural nodes. Neighbor expansion cannot cross those predicates.",
  },
  {
    eyebrow: "Operations",
    title: "NornicDB is the active retrieval data plane",
    body: "The production indexer writes graph nodes and edges into the content_graph catalog, while planner retrieval uses the embeddings vector index, graph depth controls, edge allow lists, and freshness-aware scoring.",
  },
];

const githubRepos = {
  synesis: "https://github.com/supernovae/synesis",
  openLagrange: "https://github.com/supernovae/open-lagrange",
};

export default function Page(): React.ReactNode {
  return (
    <main>
      <section className="hero">
        <nav className="nav" aria-label="Main navigation">
          <a className="brand" href="#top" aria-label="Kybern home">
            <span className="brandMark">K</span>
            <span>Kybern</span>
          </a>
          <div className="navLinks">
            <a href="#synesis">Synesis</a>
            <a href="#open-lagrange">Open Lagrange</a>
            <a href="/papers-we-love">Papers We Love</a>
            <a href="/about">About</a>
            <a href="#notes">Notes</a>
          </div>
        </nav>

        <div className="heroGrid" id="top">
          <div className="heroCopy">
            <p className="eyebrow">Synesis + Open Lagrange</p>
            <h1>Kybern</h1>
            <p className="lede">
              Building self-hosted intelligence systems where enterprise knowledge, assisted coding,
              model operations, and bounded execution work as one product surface.
            </p>
            <div className="heroActions">
              <a className="button primary" href="#synesis">Explore Synesis</a>
              <a className="button secondary" href="#open-lagrange">Open Lagrange</a>
            </div>
            <div className="repoLinks" aria-label="GitHub repositories">
              <a href={githubRepos.synesis} target="_blank" rel="noreferrer">GitHub: Synesis</a>
              <a href={githubRepos.openLagrange} target="_blank" rel="noreferrer">GitHub: Open Lagrange</a>
            </div>
          </div>

          <div className="systemVisual" role="img" aria-label="Kybern product map showing Synesis, Open WebUI, coder tools, NornicDB, and Open Lagrange">
            <div className="visualHeader">
              <span>Kybern product map</span>
              <span>self-hosted</span>
            </div>
            <div className="visualBody">
              <div className="visualColumn">
                <span className="node client">Open WebUI</span>
                <span className="node client">Claude Code</span>
                <span className="node client">opencode + IDEs</span>
              </div>
              <div className="visualColumn center">
                <span className="node planner">Synesis planner</span>
                <span className="node route">MCP + model routing</span>
                <span className="node writer">Quality gates</span>
              </div>
              <div className="visualColumn">
                <span className="node graph">NornicDB graph</span>
                <span className="node graph">Admin console</span>
                <span className="node graph">Open Lagrange</span>
              </div>
            </div>
            <div className="visualFooter">
              <span>Chat, coder tools, retrieval, governance, approvals, and artifacts in one operating model</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="synesis">
        <div className="sectionHead">
          <p className="eyebrow">Project page</p>
          <h2>Synesis</h2>
          <p>
            Synesis is a self-hosted enterprise intelligence platform for Kubernetes: Open WebUI chat,
            MCP-connected coder workflows, graph-native knowledge, model governance, quality review, and an admin
            surface for operators.
          </p>
          <div className="sectionActions">
            <a className="button secondary" href={githubRepos.synesis} target="_blank" rel="noreferrer">
              View Synesis on GitHub
            </a>
          </div>
        </div>

        <div className="featureGrid">
          {platformHighlights.map((item) => (
            <article className="feature" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <div className="deepDive">
          <div>
            <p className="eyebrow">Developer experience</p>
            <h3>Chat, coding tools, knowledge, and execution control meet in one workflow.</h3>
            <p>
              A team can use Open WebUI for planner-governed chat, then move into Claude Code, opencode, or IDE assistants
              for implementation work without losing the shared Synesis context. Coder-side tools reach the same
              knowledge, taxonomy, model routing, and quality policy through MCP and OpenAI-compatible endpoints.
            </p>
            <p>
              NornicDB still matters underneath: it supplies graph-aware retrieval across docs, code, symbols, and
              provenance. Open Lagrange wraps the work with typed plans, approvals, repository artifacts, and reviewable
              execution history.
            </p>
          </div>

          <aside className="schemaPanel">
            <h3>How it comes together</h3>
            <ol className="experienceList">
              {developerExperience.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </aside>
        </div>
      </section>

      <section className="section split" id="open-lagrange">
        <div>
          <p className="eyebrow">Control plane</p>
          <h2>Open Lagrange</h2>
        </div>
        <div className="copyBlock">
          <p>
            Open Lagrange is the execution and reconciliation layer: it accepts goals, builds typed plans,
            runs bounded task continuations, captures artifacts, supports repository work, and keeps human approvals
            explicit.
          </p>
          <p>
            Together, Synesis and Open Lagrange separate intelligence infrastructure from execution control. Synesis
            supplies trusted organizational context and quality gates; Open Lagrange records the work, state, evidence,
            and decisions needed to make non-deterministic AI-assisted runs reviewable.
          </p>
          <div className="sectionActions">
            <a className="button secondary" href={githubRepos.openLagrange} target="_blank" rel="noreferrer">
              View Open Lagrange on GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="section showcase">
        <div className="sectionHead">
          <p className="eyebrow">Product coverage</p>
          <h2>Built for the whole AI workflow</h2>
          <p>
            Synesis is not only retrieval infrastructure. It is a way to run enterprise AI across chat,
            developer tools, operations, model routing, and governed execution.
          </p>
        </div>
        <div className="showcaseGrid">
          {showcase.map((item) => (
            <article className="showcaseItem" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="notes">
        <div className="sectionHead">
          <p className="eyebrow">Synesis field notes</p>
          <h2>Latest development notes</h2>
          <p>
            The Synesis articles below reflect the current product direction across graph-native knowledge,
            authenticated retrieval, and coder-side workflows.
          </p>
        </div>
        <div className="noteGrid">
          {fieldNotes.map((note) => (
            <article className="note" key={note.title}>
              <p className="eyebrow">{note.eyebrow}</p>
              <h3>{note.title}</h3>
              <p>{note.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
