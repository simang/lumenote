import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { appUrlFromRequest } from "@/lib/config";
import {
  findSiteWithIngestTokenForUser,
  listRecentIngestJobsForSiteForUser,
  listPublishedNotesForSiteForUser,
  listRecentIngestRunsForSiteForUser,
  listShareLinksForSiteForUser,
} from "@/lib/repositories";
import type { UserShareLink } from "@/lib/repositories";

export const dynamic = "force-dynamic";

function formatUtcDate(date: Date | null) {
  if (!date) {
    return "Never";
  }

  return date.toISOString().replace(".000Z", "Z");
}

function expiryInputValue(date: Date | null) {
  return date ? formatUtcDate(date) : "";
}

function shareLinkStatus(link: Pick<UserShareLink, "expires_at" | "revoked_at">, now: Date) {
  if (link.revoked_at) {
    return "revoked";
  }

  if (link.expires_at && link.expires_at <= now) {
    return "expired";
  }

  return "active";
}

function shareLinkUrl(appUrl: string, token: string) {
  return `${appUrl}/s/${token}`;
}

function sitePath(siteId: string) {
  return `/dashboard/sites/${encodeURIComponent(siteId)}`;
}

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{
    share_error?: string;
    job_empty?: string;
    job_existing?: string;
    job_processed?: string;
    job_queued?: string;
    share_link_id?: string;
    token_error?: string;
    token_revoked?: string;
    token_rotated?: string;
  }>;
}) {
  const user = await requireUser();
  const { siteId } = await params;
  const query = await searchParams;
  const site = await findSiteWithIngestTokenForUser(user.id, siteId);

  if (!site) {
    notFound();
  }

  const [notes, shareLinks, jobs, runs] = await Promise.all([
    listPublishedNotesForSiteForUser(user.id, site.id),
    listShareLinksForSiteForUser(user.id, site.id),
    listRecentIngestJobsForSiteForUser(user.id, site.id),
    listRecentIngestRunsForSiteForUser(user.id, site.id),
  ]);
  const appUrl = appUrlFromRequest();
  const currentPath = sitePath(site.id);
  const now = new Date();
  const selectedShareLink = query.share_link_id
    ? shareLinks.find((shareLink) => shareLink.id === query.share_link_id)
    : null;
  const activeJob = jobs.find((job) => job.status === "queued" || job.status === "running");
  const agentEnv = site.ingest_token
    ? [
        `export LUMENOTE_API_URL="${appUrl}"`,
        `export LUMENOTE_SITE_ID="${site.id}"`,
        `export LUMENOTE_SITE_TOKEN="${site.ingest_token}"`,
      ].join("\n")
    : "";

  return (
    <main className="stack">
      <section className="row">
        <div>
          <Link href="/dashboard">← Dashboard</Link>
          <h1>{site.name}</h1>
          <p className="muted">
            {site.owner}/{site.repo}@{site.branch}
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="secondary" type="submit">
            Logout
          </button>
        </form>
      </section>

      {query.share_error ? (
        <section className="card stack">
          <p className="danger">Share link action failed: {query.share_error}</p>
        </section>
      ) : null}
      {query.token_error ? (
        <section className="card stack">
          <p className="danger">Site token action failed.</p>
        </section>
      ) : null}
      {query.token_rotated ? (
        <section className="card stack">
          <p className="muted">Site ingest token is ready. Copy it before rotating again.</p>
        </section>
      ) : null}
      {query.token_revoked ? (
        <section className="card stack">
          <p className="muted">Site ingest token revoked.</p>
        </section>
      ) : null}
      {query.job_queued ? (
        <section className="card stack">
          <p className="muted">Full sync job queued: {query.job_queued}</p>
        </section>
      ) : null}
      {query.job_existing ? (
        <section className="card stack">
          <p className="muted">A full sync job is already active: {query.job_existing}</p>
        </section>
      ) : null}
      {query.job_processed ? (
        <section className="card stack">
          <p className="muted">Ingest job processed: {query.job_processed}</p>
        </section>
      ) : null}
      {query.job_empty ? (
        <section className="card stack">
          <p className="muted">No queued ingest jobs for this site.</p>
        </section>
      ) : null}
      {selectedShareLink ? (
        <section className="card stack">
          <h2>Share link ready</h2>
          {selectedShareLink.token ? (
            <>
              <input
                aria-label="Share URL"
                readOnly
                value={shareLinkUrl(appUrl, selectedShareLink.token)}
              />
              <Link href={`/s/${selectedShareLink.token}`}>Open share page</Link>
            </>
          ) : (
            <p className="muted">
              This link exists, but its URL cannot be recovered because it was created before
              encrypted token storage.
            </p>
          )}
        </section>
      ) : null}

      <section className="card stack">
        <div className="row">
          <div>
            <h2>Site settings</h2>
            <p className="muted">Update this site’s slug and repository mapping.</p>
          </div>
          <div className="row compact-row">
            <Link className="button secondary" href={`/dashboard/sites/${site.id}/notes`}>
              Read vault
            </Link>
            <Link className="button secondary" href={`/p/${site.slug}`}>
              Public root
            </Link>
          </div>
        </div>
        <form action="/api/sites" method="post">
          <input name="id" type="hidden" value={site.id} />
          <input name="redirect_to" type="hidden" value={currentPath} />
          <label>
            Site slug
            <input name="slug" defaultValue={site.slug} required />
          </label>
          <label>
            Name
            <input name="name" defaultValue={site.name} required />
          </label>
          <label>
            GitHub owner
            <input name="owner" defaultValue={site.owner} required />
          </label>
          <label>
            GitHub repo
            <input name="repo" defaultValue={site.repo} required />
          </label>
          <label>
            Branch
            <input name="branch" defaultValue={site.branch} required />
          </label>
          <label>
            GitHub installation id
            <input name="github_installation_id" defaultValue={site.github_installation_id} required />
          </label>
          <button type="submit">Save settings</button>
        </form>
      </section>

      <section className="card stack">
        <h2>Agent ingest token</h2>
        <p className="muted">
          Use this site-specific token with the Lumenote publisher skill. Rotating it immediately
          invalidates the previous site token.
        </p>
        {site.ingest_token ? (
          <>
            <textarea aria-label="Agent environment variables" readOnly rows={4} value={agentEnv} />
            <p className="muted">
              Active token: ****{site.ingest_token_last_four} · Created {formatUtcDate(site.ingest_token_created_at)}
            </p>
          </>
        ) : site.ingest_token_hash ? (
          <p className="muted">
            This site has an ingest token, but it cannot be decrypted with the current environment.
            Rotate it to copy a fresh token.
          </p>
        ) : (
          <p className="muted">No site-specific ingest token has been issued.</p>
        )}
        <div className="row">
          <form action="/api/sites/ingest-token" method="post">
            <input name="intent" type="hidden" value="rotate" />
            <input name="site_id" type="hidden" value={site.id} />
            <button className="secondary" type="submit">
              {site.ingest_token_hash ? "Rotate token" : "Generate token"}
            </button>
          </form>
          <form action="/api/sites/ingest-token" method="post">
            <input name="intent" type="hidden" value="revoke" />
            <input name="site_id" type="hidden" value={site.id} />
            <button className="secondary danger-button" disabled={!site.ingest_token_hash} type="submit">
              Revoke token
            </button>
          </form>
        </div>
      </section>

      <section className="card stack">
        <h2>Full sync</h2>
        <p className="muted">
          Queue a full repository scan, then run the queued job. This keeps the dashboard request
          short and avoids long sync work during form submission.
        </p>
        {activeJob ? (
          <p className="muted">
            Active job: {activeJob.id} · {activeJob.status} · Created {formatUtcDate(activeJob.created_at)}
          </p>
        ) : null}
        <form action="/api/ingest/full-sync" method="post">
          <input name="site_id" type="hidden" value={site.id} />
          <input name="ref" type="hidden" value={site.branch} />
          <input name="redirect_to" type="hidden" value={currentPath} />
          <button className="secondary" type="submit">
            Queue full sync
          </button>
        </form>
        <form action="/api/ingest/jobs/run" method="post">
          <input name="site_id" type="hidden" value={site.id} />
          <input name="redirect_to" type="hidden" value={currentPath} />
          <button className="secondary" type="submit">
            Run queued job
          </button>
        </form>
      </section>

      <section className="card stack">
        <h2>Ingest jobs</h2>
        {jobs.length === 0 ? (
          <p className="muted">No ingest jobs for this site.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Ref</th>
                <th>Run</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>
                    <span className={`badge status-${job.status}`}>{job.status}</span>
                    <br />
                    <span className="muted">Created {formatUtcDate(job.created_at)}</span>
                  </td>
                  <td>{job.ref ?? "default"}</td>
                  <td>{job.ingest_run_id ?? "—"}</td>
                  <td>{job.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <h2>Published notes</h2>
        {notes.length === 0 ? (
          <p className="muted">No published notes for this site.</p>
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
                      <Link href={`/p/${site.slug}/${note.slug}`}>Open</Link>
                    ) : (
                      <span className="muted">unlisted route required</span>
                    )}
                  </td>
                  <td>
                    {note.visibility === "unlisted" ? (
                      <form action="/api/share-links" method="post">
                        <input name="note_id" type="hidden" value={note.id} />
                        <input name="redirect_to" type="hidden" value={currentPath} />
                        <button className="secondary" type="submit">
                          Generate link
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
        <h2>Unlisted share links</h2>
        {shareLinks.length === 0 ? (
          <p className="muted">No share links generated for this site.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Note</th>
                <th>Status</th>
                <th>URL</th>
                <th>Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shareLinks.map((shareLink) => {
                const status = shareLinkStatus(shareLink, now);
                const disabled = status === "revoked";
                const url = shareLink.token ? shareLinkUrl(appUrl, shareLink.token) : null;

                return (
                  <tr key={shareLink.id}>
                    <td>
                      <strong>{shareLink.note_title}</strong>
                      <br />
                      <span className="muted">{shareLink.note_path}</span>
                    </td>
                    <td>
                      <span className={`badge status-${status}`}>{status}</span>
                      <br />
                      <span className="muted">Created {formatUtcDate(shareLink.created_at)}</span>
                    </td>
                    <td>
                      {url ? (
                        <div className="stack compact">
                          <input aria-label={`Share URL for ${shareLink.note_title}`} readOnly value={url} />
                          <Link href={`/s/${shareLink.token}`}>Open</Link>
                        </div>
                      ) : (
                        <span className="muted">URL unavailable. Generate a new link.</span>
                      )}
                    </td>
                    <td>
                      <form action="/api/share-links/manage" className="inline-form" method="post">
                        <input name="intent" type="hidden" value="update_expiry" />
                        <input name="share_link_id" type="hidden" value={shareLink.id} />
                        <input name="redirect_to" type="hidden" value={currentPath} />
                        <input
                          aria-label={`Expiry for ${shareLink.note_title}`}
                          disabled={disabled}
                          name="expires_at"
                          placeholder="2026-06-30T00:00:00Z"
                          defaultValue={expiryInputValue(shareLink.expires_at)}
                        />
                        <button className="secondary" disabled={disabled} type="submit">
                          Save
                        </button>
                      </form>
                      <p className="muted">UTC ISO time. Blank means never expires.</p>
                    </td>
                    <td>
                      <div className="stack compact">
                        <form action="/api/share-links" method="post">
                          <input name="note_id" type="hidden" value={shareLink.note_id} />
                          <input name="redirect_to" type="hidden" value={currentPath} />
                          <button className="secondary" type="submit">
                            New URL
                          </button>
                        </form>
                        <form action="/api/share-links/manage" method="post">
                          <input name="intent" type="hidden" value="revoke" />
                          <input name="share_link_id" type="hidden" value={shareLink.id} />
                          <input name="redirect_to" type="hidden" value={currentPath} />
                          <button className="secondary danger-button" disabled={disabled} type="submit">
                            Revoke
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <h2>Recent ingestion run logs</h2>
        {runs.length === 0 ? (
          <p className="muted">No ingestion runs for this site.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.id}</td>
                  <td>{run.trigger}</td>
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
