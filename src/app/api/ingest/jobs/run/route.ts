import { getUserSession } from "@/lib/auth";
import { optionalEnv } from "@/lib/config";
import { runNextIngestJob } from "@/lib/ingest-jobs";

export const runtime = "nodejs";

function wantsJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return contentType.includes("application/json") || accept.includes("application/json");
}

function workerAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = optionalEnv("INGEST_WORKER_TOKEN") ?? optionalEnv("LUMENOTE_INGEST_TOKEN");
  return Boolean(token && authorization === `Bearer ${token}`);
}

function safeRedirectPath(path: string | undefined) {
  if (!path || !path.startsWith("/dashboard")) {
    return "/dashboard";
  }

  return path;
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      siteId: body.site_id ? String(body.site_id) : undefined,
      redirectTo: body.redirect_to ? String(body.redirect_to) : undefined,
    };
  }

  const form = await request.formData();
  return {
    siteId: form.get("site_id") ? String(form.get("site_id")) : undefined,
    redirectTo: form.get("redirect_to") ? String(form.get("redirect_to")) : undefined,
  };
}

async function handleRun(request: Request) {
  const json = wantsJson(request);
  const payload = await readPayload(request);
  const isWorker = workerAuthorized(request);
  const session = isWorker ? null : await getUserSession();

  if (!isWorker && !session) {
    if (json) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    return Response.redirect(new URL("/login", request.url), 303);
  }

  const result = await runNextIngestJob({
    userId: session?.id,
    siteId: payload.siteId,
  });

  if (json || isWorker) {
    return Response.json(result);
  }

  const redirectUrl = new URL(safeRedirectPath(payload.redirectTo), request.url);
  if (result.processed && result.job) {
    redirectUrl.searchParams.set("job_processed", result.job.id);
  } else {
    redirectUrl.searchParams.set("job_empty", "1");
  }

  return Response.redirect(redirectUrl, 303);
}

export async function POST(request: Request) {
  return handleRun(request);
}
