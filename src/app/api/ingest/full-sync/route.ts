import { requireUser } from "@/lib/auth";
import { runFullSync } from "@/lib/ingest";
import { findSiteForUser } from "@/lib/repositories";

export const runtime = "nodejs";

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      siteId: String(body.site_id ?? body.siteId ?? ""),
      ref: body.ref ? String(body.ref) : undefined,
      redirectTo: body.redirect_to ? String(body.redirect_to) : undefined,
    };
  }

  const form = await request.formData();
  return {
    siteId: String(form.get("site_id") ?? ""),
    ref: form.get("ref") ? String(form.get("ref")) : undefined,
    redirectTo: form.get("redirect_to") ? String(form.get("redirect_to")) : undefined,
  };
}

function safeRedirectPath(path: string | undefined, fallback: string) {
  if (!path || !path.startsWith("/dashboard")) {
    return fallback;
  }

  return path;
}

export async function POST(request: Request) {
  const user = await requireUser();
  const payload = await readPayload(request);

  if (!payload.siteId) {
    return Response.json({ error: "site_id is required" }, { status: 400 });
  }

  const site = await findSiteForUser(user.id, payload.siteId);
  if (!site) {
    return Response.json({ error: "site not found" }, { status: 404 });
  }

  const result = await runFullSync({
    siteId: payload.siteId,
    ref: payload.ref,
    trigger: "dashboard_full_sync",
  });

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    return Response.json(result);
  }

  return Response.redirect(new URL(safeRedirectPath(payload.redirectTo, "/dashboard"), request.url), 303);
}
