import { requireAdmin } from "@/lib/auth";
import { upsertSite } from "@/lib/repositories";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await requireAdmin();
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

  await upsertSite({
    id,
    slug,
    name,
    owner,
    repo,
    branch,
    githubInstallationId,
  });

  return Response.redirect(new URL("/admin", request.url), 303);
}
