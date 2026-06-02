import { env } from "@/lib/config";
import { runChangedPathsIngest } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const expected = `Bearer ${env("LUMENOTE_INGEST_TOKEN")}`;

  if (authorization !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const result = await runChangedPathsIngest(payload);

  return Response.json(result);
}
