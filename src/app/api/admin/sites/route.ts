import { requireUser } from "@/lib/auth";
import { getInstallationAccount } from "@/lib/github";
import {
  findGitHubInstallationForUser,
  upsertGitHubInstallation,
  upsertSite,
} from "@/lib/repositories";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const id = String(form.get("id") ?? "").trim() || undefined;
  const slug = String(form.get("slug") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const owner = String(form.get("owner") ?? "").trim();
  const repo = String(form.get("repo") ?? "").trim();
  const branch = String(form.get("branch") ?? "").trim() || "main";
  const githubInstallationId = String(form.get("github_installation_id") ?? "").trim();

  if (!slug || !name || !owner || !repo || !githubInstallationId) {
    return Response.json({ error: "slug, name, owner, repo and github_installation_id are required" }, { status: 400 });
  }

  const existingInstallation = await findGitHubInstallationForUser(user.id, githubInstallationId);
  if (!existingInstallation) {
    try {
      const account = await getInstallationAccount(githubInstallationId);
      await upsertGitHubInstallation({
        userId: user.id,
        githubInstallationId,
        accountLogin: account.accountLogin,
        accountType: account.accountType,
        repositorySelection: account.repositorySelection,
      });
    } catch {
      return Response.json({ error: "GitHub installation is not connected for this user" }, { status: 403 });
    }
  }

  await upsertSite({
    id,
    userId: user.id,
    slug,
    name,
    owner,
    repo,
    branch,
    githubInstallationId,
  });

  return Response.redirect(new URL("/admin", request.url), 303);
}
