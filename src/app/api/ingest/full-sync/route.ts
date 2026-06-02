import { requireAdmin } from "@/lib/auth";
import { runFullSync } from "@/lib/ingest";

export const runtime = "nodejs";

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      siteId: String(body.site_id ?? body.siteId ?? ""),
      ref: body.ref ? String(body.ref) : undefined,
    };
  }

  const form = await request.formData();
  return {
    siteId: String(form.get("site_id") ?? ""),
    ref: form.get("ref") ? String(form.get("ref")) : undefined,
  };
}

export async function POST(request: Request) {
  await requireAdmin();
  const payload = await readPayload(request);

  if (!payload.siteId) {
    return Response.json({ error: "site_id is required" }, { status: 400 });
  }

  const result = await runFullSync({
    siteId: payload.siteId,
    ref: payload.ref,
    trigger: "admin_full_sync",
  });

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    return Response.json(result);
  }

  return Response.redirect(new URL("/admin", request.url), 303);
}
