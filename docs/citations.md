# Citations

Research Pack citations identify the source behind a fact, synthesis point, or
brief section.

```ts
type Citation = {
  citation_id: string;
  source_id: string;
  title: string;
  url: string;
  domain: string;
  retrieved_at: string;
  published_at?: string;
  quote_refs?: string[];
};
```

Brief generation requires citations from supplied extracted sources. The pack
does not invent sources or fetch additional sources while creating a brief.

When quotes are added in future phases, they should remain short and tied to
source artifact references.
