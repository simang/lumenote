import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { env, optionalEnv } from "./config";
import type { Site } from "./types";

function privateKey() {
  return env("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
}

export async function githubForInstallation(installationId: string) {
  const auth = createAppAuth({
    appId: env("GITHUB_APP_ID"),
    privateKey: privateKey(),
    installationId,
  });

  const installationAuthentication = await auth({ type: "installation" });

  return new Octokit({
    auth: installationAuthentication.token,
  });
}

export function githubAppInstallUrl(state: string) {
  const configured = optionalEnv("GITHUB_APP_INSTALL_URL");
  if (configured) {
    const url = new URL(configured);
    url.searchParams.set("state", state);
    return url.toString();
  }

  const slug = optionalEnv("GITHUB_APP_SLUG");
  if (!slug) {
    throw new Error("GITHUB_APP_SLUG or GITHUB_APP_INSTALL_URL is required");
  }

  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function listInstallationRepositories(installationId: string) {
  const octokit = await githubForInstallation(installationId);
  const repositories = await octokit.paginate("GET /installation/repositories", {
    per_page: 100,
  });

  return repositories.map((repo) => ({
    owner: repo.owner.login,
    repo: repo.name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    private: repo.private,
  }));
}

export async function getInstallationAccount(installationId: string) {
  const repositories = await listInstallationRepositories(installationId);
  const first = repositories[0];

  return {
    accountLogin: first?.owner ?? null,
    accountType: null,
    repositorySelection: null,
  };
}

export async function assertCommitOnBranch(site: Site, sha: string) {
  const octokit = await githubForInstallation(site.github_installation_id);
  const compare = await octokit.repos.compareCommitsWithBasehead({
    owner: site.owner,
    repo: site.repo,
    basehead: `${sha}...${site.branch}`,
  });

  const status = compare.data.status;
  if (status !== "identical" && status !== "ahead") {
    throw new Error(`Commit ${sha} is not reachable from ${site.owner}/${site.repo}@${site.branch}`);
  }
}

export async function fetchRepositoryTree(site: Site, ref = site.branch) {
  const octokit = await githubForInstallation(site.github_installation_id);
  const tree = await octokit.git.getTree({
    owner: site.owner,
    repo: site.repo,
    tree_sha: ref,
    recursive: "true",
  });

  return tree.data.tree
    .filter((item) => item.type === "blob" && item.path && item.sha)
    .map((item) => ({
      path: item.path as string,
      sha: item.sha as string,
      size: item.size ?? 0,
    }));
}

export async function fetchRepositoryFile(site: Site, path: string, ref: string) {
  const octokit = await githubForInstallation(site.github_installation_id);
  const response = await octokit.repos.getContent({
    owner: site.owner,
    repo: site.repo,
    path,
    ref,
  });

  if (Array.isArray(response.data) || response.data.type !== "file") {
    throw new Error(`${path} is not a repository file`);
  }

  if (!("content" in response.data) || typeof response.data.content !== "string") {
    throw new Error(`${path} content is not available from GitHub Contents API`);
  }

  const buffer = Buffer.from(response.data.content.replace(/\n/g, ""), "base64");

  return {
    path,
    sha: response.data.sha,
    size: response.data.size,
    contentType: response.headers["content-type"] ?? "application/octet-stream",
    buffer,
    text: buffer.toString("utf8"),
  };
}
