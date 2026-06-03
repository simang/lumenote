import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listInstallationRepositories } from "@/lib/github";
import {
  claimOrphanSitesForUser,
  listGitHubInstallationsForUser,
  listSitesForUser,
} from "@/lib/repositories";

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    github_error?: string;
    installation_id?: string;
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

  const [sites, installations] = await Promise.all([
    listSitesForUser(user.id),
    listGitHubInstallationsForUser(user.id),
  ]);
  const connectedInstallation = params.installation_id
    ? installations.find((installation) => installation.github_installation_id === params.installation_id)
    : null;
  const installedRepositories = await listInstalledRepositories(
    installations.map((installation) => installation.github_installation_id),
  );
  const configuredRepositories = new Set(sites.map((site) => `${site.owner}/${site.repo}`));

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
                <th>Agent token</th>
                <th>Manage</th>
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
                  <td>{site.ingest_token_hash ? `****${site.ingest_token_last_four ?? "set"}` : "Not issued"}</td>
                  <td>
                    <Link href={`/dashboard/sites/${site.id}`}>Open</Link>
                  </td>
                  <td>
                    <form action="/api/ingest/full-sync" method="post">
                      <input name="site_id" type="hidden" value={site.id} />
                      <input name="ref" type="hidden" value={site.branch} />
                      <input name="redirect_to" type="hidden" value={`/dashboard/sites/${site.id}`} />
                      <button className="secondary" type="submit">
                        Queue sync
                      </button>
                    </form>
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
