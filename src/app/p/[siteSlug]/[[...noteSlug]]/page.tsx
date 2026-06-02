import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import {
  findPublicNote,
  findSiteBySlug,
  listBacklinks,
  listOutgoingPublicLinks,
} from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function PublicNotePage({
  params,
}: {
  params: Promise<{ siteSlug: string; noteSlug?: string[] }>;
}) {
  const { siteSlug, noteSlug } = await params;
  const slug = noteSlug?.join("/") ?? "";
  const site = await findSiteBySlug(siteSlug);

  if (!site || !slug) {
    notFound();
  }

  const note = await findPublicNote(site.id, slug);
  if (!note) {
    notFound();
  }

  const [backlinks, outgoingLinks] = await Promise.all([
    listBacklinks(note.id),
    listOutgoingPublicLinks(note.id),
  ]);

  return (
    <PageShell
      site={site}
      note={note}
      backlinks={backlinks}
      outgoingLinks={outgoingLinks}
    />
  );
}
