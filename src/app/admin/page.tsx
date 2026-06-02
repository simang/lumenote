import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listPublishedNotes, listRecentIngestRuns, listSites } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const [sites, notes, runs] = await Promise.all([
    listSites(),
    listPublishedNotes(),
    listRecentIngestRuns(),
  ]);
  const siteSlugById = new Map(sites.map((site) => [site.id, site.slug]));

  return (
    <main className="stack">
      <section className="row">
        <div>
          <h1>Admin</h1>
          <p className="muted">Repository 연결, full sync, publish 상태를 관리합니다.</p>
        </div>
        <form action="/api/admin/logout" method="post">
          <button className="secondary" type="submit">
            Logout
          </button>
        </form>
      </section>

      <section className="card stack">
        <h2>Site settings</h2>
        <form action="/api/admin/sites" method="post">
          <label>
            Existing site id
            <input name="id" placeholder="optional; blank creates a site" />
          </label>
          <label>
            Site slug
            <input name="slug" placeholder="my-notes" required />
          </label>
          <label>
            Name
            <input name="name" placeholder="My Notes" required />
          </label>
          <label>
            GitHub owner
            <input name="owner" placeholder="simang" required />
          </label>
          <label>
            GitHub repo
            <input name="repo" placeholder="my-vault" required />
          </label>
          <label>
            Branch
            <input name="branch" defaultValue="main" required />
          </label>
          <label>
            GitHub installation id
            <input name="github_installation_id" required />
          </label>
          <button type="submit">Save site</button>
        </form>
      </section>

      <section className="card stack">
        <h2>Sites</h2>
        {sites.length === 0 ? (
          <p className="muted">No sites configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Slug</th>
                <th>Repository</th>
                <th>Full sync</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id}>
                  <td>{site.id}</td>
                  <td>{site.slug}</td>
                  <td>
                    {site.owner}/{site.repo}@{site.branch}
                  </td>
                  <td>
                    <form action="/api/ingest/full-sync" method="post">
                      <input name="site_id" type="hidden" value={site.id} />
                      <input name="ref" type="hidden" value={site.branch} />
                      <button className="secondary" type="submit">
                        Run
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <h2>Published notes</h2>
        {notes.length === 0 ? (
          <p className="muted">No published notes.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Visibility</th>
                <th>Path</th>
                <th>URL</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id}>
                  <td>{note.title}</td>
                  <td>{note.visibility}</td>
                  <td>{note.path}</td>
                  <td>
                    {note.visibility === "public" ? (
                      <Link href={`/p/${siteSlugById.get(note.site_id) ?? note.site_id}/${note.slug}`}>
                        Open
                      </Link>
                    ) : (
                      <span className="muted">unlisted route required</span>
                    )}
                  </td>
                  <td>
                    {note.visibility === "unlisted" ? (
                      <form action="/api/admin/share-links" method="post">
                        <input name="note_id" type="hidden" value={note.id} />
                        <button className="secondary" type="submit">
                          Generate
                        </button>
                      </form>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <h2>Recent ingestion runs</h2>
        {runs.length === 0 ? (
          <p className="muted">No ingestion runs.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Site</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.id}</td>
                  <td>{run.site_id}</td>
                  <td>{run.status}</td>
                  <td>
                    <code>{JSON.stringify(run.summary)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
