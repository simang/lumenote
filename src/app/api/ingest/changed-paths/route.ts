import { optionalEnv } from "@/lib/config";
import { hashIngestToken } from "@/lib/crypto";
import { runChangedPathsIngest } from "@/lib/ingest";
import { findSiteIngestTokenHash } from "@/lib/repositories";

export const runtime = "nodejs";

async function authorized(payload: unknown, authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const token = authorization.slice("Bearer ".length);
  const siteId =
    payload && typeof payload === "object" && "site_id" in payload
      ? String(payload.site_id ?? "")
      : "";

  if (!siteId) {
    return false;
  }

  const site = await findSiteIngestTokenHash(siteId);
  if (!site) {
    return false;
  }

  if (site.ingest_token_hash) {
    return hashIngestToken(token) === site.ingest_token_hash;
  }

  const legacyToken = optionalEnv("LUMENOTE_INGEST_TOKEN");
  return Boolean(legacyToken && token === legacyToken);
}

export async function POST(request: Request) {
  const payload = await request.json();
  const authorization = request.headers.get("authorization");

  if (!(await authorized(payload, authorization))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runChangedPathsIngest(payload);

  return Response.json(result);
}
