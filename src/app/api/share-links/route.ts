import { requireUser } from "@/lib/auth";
import { appUrlFromRequest } from "@/lib/config";
import { encryptShareToken, hashShareToken, randomToken } from "@/lib/crypto";
import { createShareLinkForUser } from "@/lib/repositories";

export const runtime = "nodejs";

function wantsJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return contentType.includes("application/json") || accept.includes("application/json");
}

function dashboardRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/dashboard", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return Response.redirect(url, 303);
}

function parseExpiresAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid expires_at");
  }

  return date;
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      noteId: String(body.note_id ?? body.noteId ?? ""),
      expiresAt: body.expires_at ? parseExpiresAt(String(body.expires_at)) : null,
    };
  }

  const form = await request.formData();
  return {
    noteId: String(form.get("note_id") ?? ""),
    expiresAt: form.get("expires_at") ? parseExpiresAt(String(form.get("expires_at"))) : null,
  };
}

export async function POST(request: Request) {
  const user = await requireUser();
  const json = wantsJson(request);
  const payload = await readPayload(request);

  if (!payload.noteId) {
    if (json) {
      return Response.json({ error: "note_id is required" }, { status: 400 });
    }

    return dashboardRedirect(request, { share_error: "missing_note" });
  }

  const token = randomToken();
  const share = await createShareLinkForUser(user.id, payload.noteId, {
    tokenHash: hashShareToken(token),
    tokenCiphertext: encryptShareToken(token),
    expiresAt: payload.expiresAt,
  });
  const url = `${appUrlFromRequest(request)}/s/${token}`;

  if (json) {
    return Response.json({
      share_link_id: share.id,
      site_id: share.site_id,
      token,
      url,
    });
  }

  return dashboardRedirect(request, { share_link_id: share.id });
}
