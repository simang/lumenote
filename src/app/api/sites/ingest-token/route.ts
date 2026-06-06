import { requireUser } from "@/lib/auth";
import { encryptIngestToken, hashIngestToken, randomToken } from "@/lib/crypto";
import {
  revokeSiteIngestTokenForUser,
  rotateSiteIngestTokenForUser,
} from "@/lib/repositories";

export const runtime = "nodejs";

function wantsJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return contentType.includes("application/json") || accept.includes("application/json");
}

function safeRedirectPath(path: string | undefined, siteId: string) {
  if (!path || !path.startsWith("/dashboard")) {
    return `/dashboard/sites/${encodeURIComponent(siteId)}`;
  }

  return path;
}

function siteRedirect(
  request: Request,
  siteId: string,
  params: Record<string, string> = {},
  redirectTo?: string,
) {
  const url = new URL(safeRedirectPath(redirectTo, siteId), request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return Response.redirect(url, 303);
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      intent: String(body.intent ?? "rotate"),
      siteId: String(body.site_id ?? body.siteId ?? ""),
      redirectTo: body.redirect_to ? String(body.redirect_to) : undefined,
    };
  }

  const form = await request.formData();
  return {
    intent: String(form.get("intent") ?? "rotate"),
    siteId: String(form.get("site_id") ?? ""),
    redirectTo: form.get("redirect_to") ? String(form.get("redirect_to")) : undefined,
  };
}

export async function POST(request: Request) {
  const user = await requireUser();
  const json = wantsJson(request);
  const payload = await readPayload(request);

  if (!payload.siteId) {
    if (json) {
      return Response.json({ error: "site_id is required" }, { status: 400 });
    }

    return Response.redirect(new URL("/dashboard", request.url), 303);
  }

  try {
    if (payload.intent === "revoke") {
      await revokeSiteIngestTokenForUser(user.id, payload.siteId);
      if (json) {
        return Response.json({ site_id: payload.siteId, revoked: true });
      }

      return siteRedirect(request, payload.siteId, { token_revoked: "1" }, payload.redirectTo);
    }

    const token = `lnit_${randomToken(32)}`;
    const site = await rotateSiteIngestTokenForUser(user.id, payload.siteId, {
      tokenHash: hashIngestToken(token),
      tokenCiphertext: encryptIngestToken(token),
      tokenLastFour: token.slice(-4),
    });

    if (json) {
      return Response.json({
        site_id: site.id,
        token,
        token_last_four: site.ingest_token_last_four,
        token_created_at: site.ingest_token_created_at,
      });
    }

    return siteRedirect(request, site.id, { token_rotated: "1" }, payload.redirectTo);
  } catch {
    if (json) {
      return Response.json({ error: "site token update failed" }, { status: 404 });
    }

    return siteRedirect(request, payload.siteId, { token_error: "1" }, payload.redirectTo);
  }
}
