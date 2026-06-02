import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { env } from "./config";
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
