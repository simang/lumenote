import { requireUser } from "@/lib/auth";
import { getInstallationAccount } from "@/lib/github";
import {
  findSiteBySlug,
  findGitHubInstallationForUser,
  upsertGitHubInstallation,
  upsertSite,
} from "@/lib/repositories";

export const runtime = "nodejs";

async function availableAutoSlug(slug: string, owner: string, repo: string) {
  const fallbackBase = `${owner}-${repo}`
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || slug;

  const bases = [slug, fallbackBase];
  for (const base of bases) {
    if (!(await findSiteBySlug(base))) {
      return base;
    }
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${fallbackBase}-${suffix}`;
    if (!(await findSiteBySlug(candidate))) {
      return candidate;
    }
  }

  throw new Error("Could not find an available site slug");
}

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
  const autoSlug = String(form.get("auto_slug") ?? "") === "1";
  const redirectTo = String(form.get("redirect_to") ?? "").trim();

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

  const siteSlug = !id && autoSlug ? await availableAutoSlug(slug, owner, repo) : slug;

  try {
    const site = await upsertSite({
      id,
      userId: user.id,
      slug: siteSlug,
      name,
      owner,
      repo,
      branch,
      githubInstallationId,
    });

    if (redirectTo.startsWith("/dashboard")) {
      return Response.redirect(new URL(redirectTo, request.url), 303);
    }

    return Response.redirect(new URL(`/dashboard/sites/${site.id}/notes`, request.url), 303);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return Response.json({ error: `site slug is already taken: ${siteSlug}` }, { status: 409 });
    }

    throw error;
  }

  return Response.redirect(new URL("/vault", request.url), 303);
}
