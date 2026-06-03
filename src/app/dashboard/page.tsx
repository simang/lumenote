import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { appUrlFromRequest } from "@/lib/config";
import { listInstallationRepositories } from "@/lib/github";
import {
  claimOrphanSitesForUser,
  listGitHubInstallationsForUser,
  listPublishedNotesForUser,
  listRecentIngestRunsForUser,
  listShareLinksForUser,
  listSitesForUser,
} from "@/lib/repositories";
import type { UserShareLink } from "@/lib/repositories";

export const dynamic = "force-dynamic";

type InstalledRepository = {
  installationId: string;
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
};

async function listInstalledRepositories(installationIds: string[]) {
  const results = await Promise.all(
    installationIds.map(async (installationId) => {
      try {
        const repositories = await listInstallationRepositories(installationId);
        return repositories.map((repository) => ({
          installationId,
          ...repository,
        }));
      } catch {
        return [] satisfies InstalledRepository[];
      }
    }),
  );

  return results.flat();
}

function slugFromRepo(repo: string) {
  return repo
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "vault";
}

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    github_error?: string;
    installation_id?: string;
    share_error?: string;
    share_link_id?: string;
    state?: string;
  }>;
}) {
  const user = await requireUser();
  await claimOrphanSitesForUser(user.id);

  const params = await searchParams;
  if (params.installation_id && params.state) {
    redirect(
      `/api/github/installations/callback?installation_id=${encodeURIComponent(
        params.installation_id,
      )}&state=${encodeURIComponent(params.state)}`,
    );
  }

  const [sites, notes, runs, installations, shareLinks] = await Promise.all([
    listSitesForUser(user.id),
    listPublishedNotesForUser(user.id),
    listRecentIngestRunsForUser(user.id),
    listGitHubInstallationsForUser(user.id),
    listShareLinksForUser(user.id),
  ]);
  const connectedInstallation = params.installation_id
    ? installations.find((installation) => installation.github_installation_id === params.installation_id)
    : null;
  const installedRepositories = await listInstalledRepositories(
    installations.map((installation) => installation.github_installation_id),
  );
  const siteSlugById = new Map(sites.map((site) => [site.id, site.slug]));
  const configuredRepositories = new Set(sites.map((site) => `${site.owner}/${site.repo}`));
  const appUrl = appUrlFromRequest();
  const now = new Date();
  const selectedShareLink = params.share_link_id
    ? shareLinks.find((shareLink) => shareLink.id === params.share_link_id)
    : null;

  return (
    <main className="stack">
      <section className="row">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Signed in as {user.email}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="secondary" type="submit">
            Logout
          </button>
        </form>
      </section>

      {params.github_error ? (
        <section className="card stack">
          <p className="danger">GitHub install failed: {params.github_error}</p>
        </section>
      ) : null}
      {connectedInstallation ? (
        <section className="card stack">
          <p className="muted">GitHub App installation connected: {connectedInstallation.github_installation_id}</p>
        </section>
      ) : params.installation_id ? (
        <section className="card stack">
          <p className="danger">
            GitHub returned installation {params.installation_id}, but it was not saved. Use Connect GitHub again or set the GitHub App Setup URL to the callback URL.
          </p>
        </section>
      ) : null}

      {params.share_error ? (
        <section className="card stack">
          <p className="danger">Share link action failed: {params.share_error}</p>
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
              This link was updated, but its URL cannot be recovered because it was created before
              encrypted token storage.
            </p>
          )}
        </section>
      ) : null}

      <section className="card stack">
        <div className="row">
          <div>
            <h2>GitHub connection</h2>
            <p className="muted">
              Install the Lumenote GitHub App, then choose a repository to create a site.
            </p>
          </div>
          <Link className="button" href="/api/github/installations/start">
            Connect GitHub
          </Link>
        </div>
        {installations.length === 0 ? (
          <p className="muted">No GitHub App installations connected.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Installation</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {installations.map((installation) => (
                <tr key={installation.id}>
                  <td>{installation.github_installation_id}</td>
                  <td>{installation.account_login ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <h2>Create site from installed repository</h2>
        {installedRepositories.length === 0 ? (
          <p className="muted">Connect GitHub to list repositories.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Branch</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {installedRepositories.map((repository) => {
                const configured = configuredRepositories.has(repository.fullName);
                return (
                  <tr key={`${repository.installationId}:${repository.fullName}`}>
                    <td>{repository.fullName}</td>
                    <td>{repository.defaultBranch}</td>
                    <td>
                      {configured ? (
                        <span className="muted">Configured</span>
                      ) : (
                        <form action="/api/sites" method="post">
                          <input name="auto_slug" type="hidden" value="1" />
                          <input name="slug" type="hidden" value={slugFromRepo(repository.repo)} />
                          <input name="name" type="hidden" value={repository.repo} />
                          <input name="owner" type="hidden" value={repository.owner} />
                          <input name="repo" type="hidden" value={repository.repo} />
                          <input name="branch" type="hidden" value={repository.defaultBranch} />
                          <input name="github_installation_id" type="hidden" value={repository.installationId} />
                          <button className="secondary" type="submit">
                            Create site
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <details className="card stack">
        <summary>Advanced manual site setup</summary>
        <p className="muted">
          Use this only when the installed repository list is unavailable or you need to edit an
          existing site id directly.
        </p>
        <form action="/api/sites" method="post">
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
      </details>

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
                        Sync now
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
                      <form action="/api/share-links" method="post">
                        <input name="note_id" type="hidden" value={note.id} />
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
        <p className="muted">
          Manage generated unlisted URLs. Links created before URL storage cannot be copied again;
          generate a new link if needed.
        </p>
        {shareLinks.length === 0 ? (
          <p className="muted">No share links generated.</p>
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
                          <button className="secondary" type="submit">
                            New URL
                          </button>
                        </form>
                        <form action="/api/share-links/manage" method="post">
                          <input name="intent" type="hidden" value="revoke" />
                          <input name="share_link_id" type="hidden" value={shareLink.id} />
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
