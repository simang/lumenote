import { requireUser } from "@/lib/auth";
import { appUrlFromRequest } from "@/lib/config";
import { hashShareToken, randomToken } from "@/lib/crypto";
import { createShareLinkForUser } from "@/lib/repositories";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const noteId = String(form.get("note_id") ?? "");

  if (!noteId) {
    return Response.json({ error: "note_id is required" }, { status: 400 });
  }

  const token = randomToken();
  const share = await createShareLinkForUser(user.id, noteId, hashShareToken(token));
  const url = `${appUrlFromRequest(request)}/s/${token}`;

  return Response.json({
    share_link_id: share.id,
    site_id: share.site_id,
    token,
    url,
  });
}
