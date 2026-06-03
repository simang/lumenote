import { createGitHubInstallState, requireUser } from "@/lib/auth";
import { githubAppInstallUrl } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireUser();

  try {
    const state = await createGitHubInstallState();
    return Response.redirect(githubAppInstallUrl(state), 303);
  } catch (error) {
    const url = new URL("/dashboard", request.url);
    url.searchParams.set("github_error", error instanceof Error ? error.message : "GitHub App install URL failed");
    return Response.redirect(url, 303);
  }
}
