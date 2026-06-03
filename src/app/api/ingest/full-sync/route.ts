import { requireUser } from "@/lib/auth";
import { createFullSyncJobForUser } from "@/lib/repositories";

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

  try {
    const job = await createFullSyncJobForUser(user.id, payload.siteId, payload.ref);
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      return Response.json({
        ingest_job_id: job.id,
        status: job.status,
        created: job.created,
      });
    }

    const redirectPath = safeRedirectPath(payload.redirectTo, "/dashboard");
    const redirectUrl = new URL(redirectPath, request.url);
    redirectUrl.searchParams.set(job.created ? "job_queued" : "job_existing", job.id);
    return Response.redirect(redirectUrl, 303);
  } catch {
    return Response.json({ error: "site not found" }, { status: 404 });
  }
}
