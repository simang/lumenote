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

function slugFromRepo(owner: string, repo: string) {
  return `${owner}-${repo}`
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "vault";
}

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<{
    github_error?: string;
    installation_id?: string;
    setup?: string;
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

  if (sites.length > 0 && params.setup !== "1") {
    redirect(`/dashboard/sites/${encodeURIComponent(sites[0].id)}/notes`);
  }

  const installedRepositories = await listInstalledRepositories(
    installations.map((installation) => installation.github_installation_id),
  );
  const connectedInstallation = params.installation_id
    ? installations.find((installation) => installation.github_installation_id === params.installation_id)
    : null;
  const configuredRepositories = new Set(sites.map((site) => `${site.owner}/${site.repo}`));

  return (
    <main className="stack">
      <section className="row">
        <div>
          <h1>Open your vault</h1>
          <p className="muted">Signed in as {user.email}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="secondary" type="submit">
            Logout
          </button>
        </form>
      </section>

      {params.github_error ? (
        <section className="card stack compact">
          <p className="danger">GitHub install failed: {params.github_error}</p>
        </section>
      ) : null}
      {connectedInstallation ? (
        <section className="card stack compact">
          <p className="muted">GitHub App installation connected: {connectedInstallation.github_installation_id}</p>
        </section>
      ) : null}

      <section className="card stack">
        <span className="badge">Vault-first setup</span>
        <h2>Connect a GitHub vault</h2>
        <p className="muted">
          Install the Lumenote GitHub App, then create a site from one of the repositories it can read.
        </p>
        <div className="row">
          <Link className="button" href="/api/github/installations/start">
            Connect GitHub
          </Link>
          {sites[0] ? (
            <Link className="button secondary" href={`/dashboard/sites/${sites[0].id}/notes`}>
              Open current vault
            </Link>
          ) : null}
          <Link className="button secondary" href="/dashboard">
            Advanced dashboard
          </Link>
        </div>
      </section>

      <section className="card stack">
        <h2>Create vault</h2>
        {installations.length === 0 ? (
          <p className="muted">Connect GitHub to list repositories.</p>
        ) : installedRepositories.length === 0 ? (
          <p className="muted">
            No repositories are available from the connected installation. Reconnect GitHub and allow
            access to your vault repository.
          </p>
        ) : (
          <div className="repo-grid">
            {installedRepositories.map((repository) => (
              <article className="repo-card" key={`${repository.installationId}:${repository.fullName}`}>
                <div>
                  <h3>{repository.fullName}</h3>
                  <p className="muted">
                    {repository.defaultBranch} · {repository.private ? "Private" : "Public"}
                  </p>
                </div>
                {configuredRepositories.has(repository.fullName) ? (
                  <span className="muted">Already configured</span>
                ) : (
                  <form action="/api/sites" method="post">
                    <input name="auto_slug" type="hidden" value="1" />
                    <input name="slug" type="hidden" value={slugFromRepo(repository.owner, repository.repo)} />
                    <input name="name" type="hidden" value={repository.repo} />
                    <input name="owner" type="hidden" value={repository.owner} />
                    <input name="repo" type="hidden" value={repository.repo} />
                    <input name="branch" type="hidden" value={repository.defaultBranch} />
                    <input name="github_installation_id" type="hidden" value={repository.installationId} />
                    <button className="secondary" type="submit">
                      Create and open
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
