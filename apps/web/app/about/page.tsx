import ContactBox from "./ContactBox";

const principles = [
  {
    title: "Research-forward",
    body: "Kybern treats papers, operating experience, and implementation evidence as part of the product process, not as decoration after the fact.",
  },
  {
    title: "Self-hosted by default",
    body: "Synesis and Open Lagrange are built for teams that need control over models, data, governance, retrieval, and execution boundaries.",
  },
  {
    title: "Human review stays visible",
    body: "The goal is not fully invisible automation. The goal is powerful AI work that leaves plans, evidence, decisions, and artifacts humans can inspect.",
  },
];

export default function AboutPage(): React.ReactNode {
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

      <section className="subpageHero aboutHero">
        <p className="eyebrow">About Kybern</p>
        <h1>We build infrastructure for reviewable, research-grounded AI work.</h1>
        <p className="lede">
          Kybern is the home of Synesis and Open Lagrange: self-hosted intelligence, graph-native knowledge,
          agentic coding, model operations, and bounded execution control.
        </p>
      </section>

      <section className="principleGrid" aria-label="Kybern principles">
        {principles.map((principle) => (
          <article className="principleCard" key={principle.title}>
            <h3>{principle.title}</h3>
            <p>{principle.body}</p>
          </article>
        ))}
      </section>

      <section className="aboutContact" aria-label="Contact Kybern">
        <ContactBox />
      </section>
    </main>
  );
}
