import { requireUser, verifyGitHubInstallState } from "@/lib/auth";
import { getInstallationAccount } from "@/lib/github";
import { upsertGitHubInstallation } from "@/lib/repositories";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state") ?? "";

  if (!installationId) {
    const redirectUrl = new URL("/admin", request.url);
    redirectUrl.searchParams.set("github_error", "missing installation_id");
    return Response.redirect(redirectUrl, 303);
  }

  if (!(await verifyGitHubInstallState(state))) {
    const redirectUrl = new URL("/admin", request.url);
    redirectUrl.searchParams.set("github_error", "invalid state");
    return Response.redirect(redirectUrl, 303);
  }

  try {
    const account = await getInstallationAccount(installationId);
    await upsertGitHubInstallation({
      userId: user.id,
      githubInstallationId: installationId,
      accountLogin: account.accountLogin,
      accountType: account.accountType,
      repositorySelection: account.repositorySelection,
    });

    const redirectUrl = new URL("/admin", request.url);
    redirectUrl.searchParams.set("installation_id", installationId);
    return Response.redirect(redirectUrl, 303);
  } catch (error) {
    const redirectUrl = new URL("/admin", request.url);
    redirectUrl.searchParams.set("github_error", error instanceof Error ? error.message : "installation failed");
    return Response.redirect(redirectUrl, 303);
  }
}
