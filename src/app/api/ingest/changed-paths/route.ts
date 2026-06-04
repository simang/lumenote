import { optionalEnv } from "@/lib/config";
import { hashIngestToken } from "@/lib/crypto";
import { runChangedPathsIngest, type ChangedPathsInput } from "@/lib/ingest";
import { findSiteIngestTokenHash } from "@/lib/repositories";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isChangedPathsInput(payload: unknown): payload is ChangedPathsInput {
  if (!isRecord(payload) || !isRecord(payload.repository) || !Array.isArray(payload.changes)) {
    return false;
  }

  if (
    typeof payload.site_id !== "string" ||
    typeof payload.after !== "string" ||
    typeof payload.repository.owner !== "string" ||
    typeof payload.repository.repo !== "string" ||
    typeof payload.repository.branch !== "string"
  ) {
    return false;
  }

  const statuses = new Set(["added", "modified", "deleted", "renamed"]);
  return payload.changes.every((change) => {
    if (!isRecord(change)) {
      return false;
    }

    if (typeof change.status !== "string" || !statuses.has(change.status)) {
      return false;
    }

    return (
      typeof change.path === "string" &&
      (change.previous_path === undefined || typeof change.previous_path === "string")
    );
  });
}

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorStatus(error: unknown) {
  const message = errorMessage(error);
  const status =
    error && typeof error === "object" && "status" in error && typeof error.status === "number"
      ? error.status
      : undefined;

  if (message.startsWith("Site not found:")) {
    return 404;
  }

  if (
    message.includes("does not match configured site") ||
    message.includes("is not reachable from")
  ) {
    return 422;
  }

  if (status === 401 || status === 403 || status === 404) {
    return 502;
  }

  return 500;
}

function errorCode(error: unknown) {
  const message = errorMessage(error);
  const status =
    error && typeof error === "object" && "status" in error && typeof error.status === "number"
      ? error.status
      : undefined;

  if (message.startsWith("Site not found:")) {
    return "site_not_found";
  }

  if (message.includes("does not match configured site")) {
    return "repository_mismatch";
  }

  if (message.includes("is not reachable from")) {
    return "commit_not_reachable";
  }

  if (status === 401 || status === 403 || status === 404) {
    return "github_app_unavailable";
  }

  return "ingest_failed";
}

function publicErrorMessage(error: unknown) {
  if (errorCode(error) === "github_app_unavailable") {
    return "GitHub App installation is unavailable. Reconnect the GitHub App and update the site to use a valid installation.";
  }

  return errorMessage(error);
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!isChangedPathsInput(payload)) {
    return Response.json(
      { error: "invalid_payload", message: "Request body does not match changed-path ingest payload." },
      { status: 400 },
    );
  }

  const authorization = request.headers.get("authorization");

  if (!(await authorized(payload, authorization))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runChangedPathsIngest(payload);
    return Response.json(result);
  } catch (error) {
    console.error("Changed-path ingest failed", error);
    return Response.json(
      {
        error: errorCode(error),
        message: publicErrorMessage(error),
      },
      { status: errorStatus(error) },
    );
  }
}
