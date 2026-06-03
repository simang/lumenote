import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import {
  findPublicNote,
  findSiteBySlug,
  listBacklinks,
  listOutgoingPublicLinks,
  listPublicNotesForSite,
} from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function PublicNotePage({
  params,
}: {
  params: Promise<{ siteSlug: string; noteSlug?: string[] }>;
}) {
  const { siteSlug, noteSlug } = await params;
  const slug = noteSlug?.join("/") ?? "";
  const site = await findSiteBySlug(siteSlug);

  if (!site) {
    notFound();
  }

  if (!slug) {
    const notes = await listPublicNotesForSite(site.id);

    return (
      <main className="stack">
        <section className="card stack">
          <span className="badge">Public site</span>
          <h1>{site.name}</h1>
          <p className="muted">
            Published notes from {site.owner}/{site.repo}.
          </p>
        </section>

        <section className="card stack">
          <h2>Notes</h2>
          {notes.length === 0 ? (
            <p className="muted">No public notes published yet.</p>
          ) : (
            <div className="note-list">
              {notes.map((note) => (
                <article className="note-list-item" key={note.id}>
                  <h3>
                    <a href={`/p/${site.slug}/${note.slug}`}>{note.title}</a>
                  </h3>
                  {note.description ? <p>{note.description}</p> : null}
                  <p className="muted">{note.path}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    );
  }

  const note = await findPublicNote(site.id, slug);
  if (!note) {
    notFound();
  }

  const [backlinks, outgoingLinks] = await Promise.all([
    listBacklinks(note.id),
    listOutgoingPublicLinks(note.id),
  ]);

  return (
    <PageShell
      site={site}
      note={note}
      backlinks={backlinks}
      outgoingLinks={outgoingLinks}
    />
  );
}
