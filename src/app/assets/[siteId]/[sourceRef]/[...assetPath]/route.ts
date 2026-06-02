import { fetchRepositoryFile } from "@/lib/github";
import { findAssetForRequest } from "@/lib/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string; sourceRef: string; assetPath: string[] }> },
) {
  const { siteId, sourceRef, assetPath } = await params;
  const path = assetPath.join("/");
  const asset = await findAssetForRequest(siteId, sourceRef, path);

  if (!asset) {
    return new Response("Not found", { status: 404 });
  }

  const file = await fetchRepositoryFile(asset.site, asset.path, asset.source_sha);

  return new Response(file.buffer, {
    headers: {
      "Content-Type": asset.content_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: asset.source_sha,
    },
  });
}
