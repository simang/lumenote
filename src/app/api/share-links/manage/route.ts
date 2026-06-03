import { requireUser } from "@/lib/auth";
import { revokeShareLinkForUser, updateShareLinkExpiryForUser } from "@/lib/repositories";

export const runtime = "nodejs";

function safeRedirectPath(path: string | undefined) {
  if (!path || !path.startsWith("/dashboard")) {
    return "/dashboard";
  }

  return path;
}

function dashboardRedirect(request: Request, params: Record<string, string>, redirectTo?: string) {
  const url = new URL(safeRedirectPath(redirectTo), request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return Response.redirect(url, 303);
}

function parseOptionalExpiresAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid expiry date");
  }

  return date;
}

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const shareLinkId = String(form.get("share_link_id") ?? "");
  const redirectTo = form.get("redirect_to") ? String(form.get("redirect_to")) : undefined;

  if (!shareLinkId) {
    return dashboardRedirect(request, { share_error: "missing_share_link" }, redirectTo);
  }

  try {
    if (intent === "revoke") {
      await revokeShareLinkForUser(user.id, shareLinkId);
      return dashboardRedirect(request, { share_link_id: shareLinkId }, redirectTo);
    }

    if (intent === "update_expiry") {
      const expiresAt = parseOptionalExpiresAt(String(form.get("expires_at") ?? ""));
      await updateShareLinkExpiryForUser(user.id, shareLinkId, expiresAt);
      return dashboardRedirect(request, { share_link_id: shareLinkId }, redirectTo);
    }
  } catch {
    return dashboardRedirect(request, { share_error: "share_link_update_failed" }, redirectTo);
  }

  return dashboardRedirect(request, { share_error: "unknown_share_link_action" }, redirectTo);
}
