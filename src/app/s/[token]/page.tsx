import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { findSharePage, listBacklinks, listOutgoingPublicLinks } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function ShareNotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const page = await findSharePage(token);

  if (!page) {
    notFound();
  }

  const [backlinks, outgoingLinks] = await Promise.all([
    listBacklinks(page.note.id),
    listOutgoingPublicLinks(page.note.id),
  ]);

  return (
    <PageShell
      site={page.site}
      note={page.note}
      backlinks={backlinks}
      outgoingLinks={outgoingLinks}
    />
  );
}
