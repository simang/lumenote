import { requireUser } from "@/lib/auth";
import { revokeShareLinkForUser, updateShareLinkExpiryForUser } from "@/lib/repositories";

export const runtime = "nodejs";

function dashboardRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/dashboard", request.url);
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

  if (!shareLinkId) {
    return dashboardRedirect(request, { share_error: "missing_share_link" });
  }

  try {
    if (intent === "revoke") {
      await revokeShareLinkForUser(user.id, shareLinkId);
      return dashboardRedirect(request, { share_link_id: shareLinkId });
    }

    if (intent === "update_expiry") {
      const expiresAt = parseOptionalExpiresAt(String(form.get("expires_at") ?? ""));
      await updateShareLinkExpiryForUser(user.id, shareLinkId, expiresAt);
      return dashboardRedirect(request, { share_link_id: shareLinkId });
    }
  } catch {
    return dashboardRedirect(request, { share_error: "share_link_update_failed" });
  }

  return dashboardRedirect(request, { share_error: "unknown_share_link_action" });
}
