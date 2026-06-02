import Link from "next/link";
import type { Note, Site } from "@/lib/types";

export function PageShell({
  site,
  note,
  backlinks,
  outgoingLinks,
}: {
  site: Site;
  note: Note;
  backlinks: Array<{ id: string; title: string; slug: string }>;
  outgoingLinks: Array<{ id: string; title: string; slug: string }>;
}) {
  return (
    <main className="note-shell">
      <article>
        <header>
          <p className="muted">{site.name}</p>
          <h1>{note.title}</h1>
          {note.description ? <p className="muted">{note.description}</p> : null}
        </header>
        <section dangerouslySetInnerHTML={{ __html: note.html }} />
        {note.lumenote.backlinks || outgoingLinks.length > 0 ? (
          <footer className="note-links">
            {outgoingLinks.length > 0 ? (
              <section>
                <h2>Outgoing links</h2>
                <ul>
                  {outgoingLinks.map((target) => (
                    <li key={target.id}>
                      <Link href={`/p/${site.slug}/${target.slug}`}>{target.title}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {note.lumenote.backlinks && backlinks.length > 0 ? (
              <section>
                <h2>Backlinks</h2>
                <ul>
                  {backlinks.map((source) => (
                    <li key={source.id}>
                      <Link href={`/p/${site.slug}/${source.slug}`}>{source.title}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </footer>
        ) : null}
      </article>
    </main>
  );
}
