import type { PoolClient } from "pg";
import { contentTypeForPath, fileKind, isMarkdownPath, isSupportedAssetPath } from "./file-kind";
import {
  assertCommitOnBranch,
  fetchRepositoryFile,
  fetchRepositoryTree,
} from "./github";
import { newId } from "./ids";
import {
  encodeVaultPathForUrl,
  notePathCandidates,
  parseNoteDraft,
  renderNoteDraft,
  resolveVaultPath,
  type ParsedNoteDraft,
} from "./markdown";
import {
  createIngestRun,
  findCompletedIngestRunByKey,
  findConflictingSlug,
  findSiteById,
  finishIngestRun,
  getSourceFileMap,
  listResolverNotes,
  markSourceDeleted,
  replaceNoteLinks,
  upsertAsset,
  upsertNote,
  upsertSourceFile,
} from "./repositories";
import { sha256, stableJson } from "./crypto";
import { withTransaction } from "./db";
import type { Note, ResolverNote, Site, SourceFile } from "./types";

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export type ChangedPath = {
  status: ChangeStatus;
  path: string;
  previous_path?: string;
};

export type ChangedPathsInput = {
  site_id: string;
  repository: {
    owner: string;
    repo: string;
    branch: string;
  };
  before?: string | null;
  after: string;
  changes: ChangedPath[];
};

type IngestTrigger = "github_action" | "admin_full_sync" | "manual";

type ParsedPendingNote = {
  draft: ParsedNoteDraft;
  sourceMarkdown: string;
  parseError: string | null;
  conflictError: string | null;
};

type IngestSummary = {
  changed: number;
  notesParsed: number;
  notesPublished: number;
  notesUnpublished: number;
  assetsUpserted: number;
  deleted: number;
  errors: Array<{ path: string; message: string }>;
};

function emptySummary(changed: number): IngestSummary {
  return {
    changed,
    notesParsed: 0,
    notesPublished: 0,
    notesUnpublished: 0,
    assetsUpserted: 0,
    deleted: 0,
    errors: [],
  };
}

function normalizePath(path: string) {
  return path.replace(/^\/+/, "").replace(/\\/g, "/");
}

function normalizeChanges(changes: ChangedPath[]) {
  return changes
    .map((change) => ({
      status: change.status,
      path: normalizePath(change.path),
      previous_path: change.previous_path ? normalizePath(change.previous_path) : undefined,
    }))
    .filter((change) => {
      if (change.status === "renamed") {
        return (
          isMarkdownPath(change.path) ||
          isSupportedAssetPath(change.path) ||
          Boolean(change.previous_path && (isMarkdownPath(change.previous_path) || isSupportedAssetPath(change.previous_path)))
        );
      }

      return isMarkdownPath(change.path) || isSupportedAssetPath(change.path);
    })
    .sort((left, right) =>
      `${left.status}:${left.previous_path ?? ""}:${left.path}`.localeCompare(
        `${right.status}:${right.previous_path ?? ""}:${right.path}`,
      ),
    );
}

function idempotencyKey(input: ChangedPathsInput, changes: ChangedPath[]) {
  return sha256(
    stableJson({
      site_id: input.site_id,
      after: input.after,
      changes,
    }),
  );
}

function assertRepositoryMatches(site: Site, repository: ChangedPathsInput["repository"]) {
  if (
    site.owner !== repository.owner ||
    site.repo !== repository.repo ||
    site.branch !== repository.branch
  ) {
    throw new Error(
      `Payload repository ${repository.owner}/${repository.repo}@${repository.branch} does not match site ${site.owner}/${site.repo}@${site.branch}`,
    );
  }
}

function applyPendingResolverNotes(existing: ResolverNote[], pending: ParsedPendingNote[]) {
  const byPath = new Map(existing.map((note) => [note.path, note]));

  for (const item of pending) {
    const current = byPath.get(item.draft.path);
    byPath.set(item.draft.path, {
      id: current?.id ?? newId("note"),
      path: item.draft.path,
      title: item.draft.title,
      slug: item.draft.slug,
      publish: item.draft.publish && !item.conflictError && !item.parseError,
      visibility: item.draft.visibility,
      deleted_at: null,
      parse_error: item.conflictError ?? item.parseError,
    });
  }

  return [...byPath.values()];
}

function buildNoteResolver(site: Site, notes: ResolverNote[], currentNotePath: string) {
  const active = notes.filter((note) => !note.deleted_at);

  return (target: string) => {
    const pathMatches = notePathCandidates(currentNotePath, target).flatMap((candidate) =>
      active.filter((note) => note.path === candidate),
    );

    const candidates =
      pathMatches.length > 0
        ? pathMatches
        : active.filter((note) => {
            const normalizedTarget = target.toLowerCase();
            const filename = note.path
              .split("/")
              .pop()
              ?.replace(/\.md$/i, "")
              .toLowerCase();
            return (
              note.title.toLowerCase() === normalizedTarget ||
              filename === normalizedTarget
            );
          });

    const unique = [...new Map(candidates.map((note) => [note.id, note])).values()];

    if (unique.length === 0) {
      return { status: "unresolved" as const };
    }

    if (unique.length > 1) {
      return { status: "ambiguous" as const, candidates: unique };
    }

    const note = unique[0];
    if (!note.publish || note.parse_error || note.deleted_at || note.visibility !== "public") {
      return { status: "private" as const, note };
    }

    return {
      status: "resolved" as const,
      note,
      href: `/p/${encodeURIComponent(site.slug)}/${encodeVaultPathForUrl(note.slug)}`,
    };
  };
}

function buildAssetResolver(
  site: Site,
  sourceFiles: Map<string, SourceFile>,
  changedAssets: Map<string, SourceFile>,
) {
  function assetPathCandidates(target: string, currentNotePath: string) {
    const normalizedTarget = target.replace(/^\/+/, "");
    if (target.startsWith(".") || target.startsWith("../") || target.startsWith("/")) {
      return [resolveVaultPath(currentNotePath, target)];
    }

    const currentDir = currentNotePath.split("/").slice(0, -1).join("/");
    return [
      currentDir ? `${currentDir}/${normalizedTarget}` : normalizedTarget,
      normalizedTarget,
    ];
  }

  return (target: string, currentNotePath: string) => {
    for (const path of assetPathCandidates(target, currentNotePath)) {
      const sourceFile = changedAssets.get(path) ?? sourceFiles.get(path);

      if (!sourceFile || sourceFile.kind !== "asset" || sourceFile.deleted_at) {
        continue;
      }

      return {
        path,
        href: `/assets/${encodeURIComponent(site.id)}/${encodeURIComponent(
          sourceFile.source_sha,
        )}/${encodeVaultPathForUrl(path)}`,
      };
    }

    return null;
  };
}

async function saveErroredNote(
  client: PoolClient,
  siteId: string,
  path: string,
  sourceSha: string,
  message: string,
) {
  const slug = path.replace(/\.md$/i, "");
  const noteId = await upsertNote(client, {
    siteId,
    path,
    sourceSha,
    slug,
    title: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
    description: null,
    publish: false,
    visibility: "private",
    frontmatter: {},
    lumenote: {},
    bodyHash: sha256(""),
    html: "",
    parseError: message,
  });
  await replaceNoteLinks(client, noteId, []);
}

async function detectConflicts(siteId: string, pending: ParsedPendingNote[]) {
  const slugCounts = new Map<string, string[]>();

  for (const item of pending) {
    if (!item.draft.publish || item.parseError) {
      continue;
    }

    const paths = slugCounts.get(item.draft.slug) ?? [];
    paths.push(item.draft.path);
    slugCounts.set(item.draft.slug, paths);
  }

  for (const item of pending) {
    if (!item.draft.publish || item.parseError) {
      continue;
    }

    const sameBatchPaths = slugCounts.get(item.draft.slug) ?? [];
    if (sameBatchPaths.length > 1) {
      item.conflictError = `slug conflict for "${item.draft.slug}" with ${sameBatchPaths.join(", ")}`;
      continue;
    }

    const existing = await findConflictingSlug(siteId, item.draft.slug, item.draft.path);
    if (existing) {
      item.conflictError = `slug conflict for "${item.draft.slug}" with ${existing.path}`;
    }
  }
}

async function processChanges(options: {
  site: Site;
  ref: string;
  changes: ChangedPath[];
  client: PoolClient;
  summary: IngestSummary;
}) {
  const { site, ref, changes, client, summary } = options;
  const normalized = normalizeChanges(changes);
  const sourceFiles = await getSourceFileMap(site.id);
  const changedAssets = new Map<string, SourceFile>();
  const pendingNotes: ParsedPendingNote[] = [];

  for (const change of normalized) {
    if (change.status === "deleted" || change.status === "renamed") {
      const deletedPath = change.status === "renamed" ? change.previous_path : change.path;
      if (deletedPath) {
        await markSourceDeleted(client, site.id, deletedPath);
        sourceFiles.delete(deletedPath);
        summary.deleted += 1;
      }
    }
  }

  for (const change of normalized) {
    if (change.status === "deleted") {
      continue;
    }

    if (!isSupportedAssetPath(change.path)) {
      continue;
    }

    const file = await fetchRepositoryFile(site, change.path, ref);
    const sourceFile: SourceFile = {
      site_id: site.id,
      path: file.path,
      source_sha: file.sha,
      kind: "asset",
      size: file.size,
      deleted_at: null,
    };

    await upsertSourceFile(client, sourceFile);
    await upsertAsset(client, {
      siteId: site.id,
      path: file.path,
      sourceSha: file.sha,
      contentType: contentTypeForPath(file.path),
      size: file.size,
    });

    sourceFiles.set(file.path, sourceFile);
    changedAssets.set(file.path, sourceFile);
    summary.assetsUpserted += 1;
  }

  for (const change of normalized) {
    if (change.status === "deleted" || !isMarkdownPath(change.path)) {
      continue;
    }

    const file = await fetchRepositoryFile(site, change.path, ref);
    await upsertSourceFile(client, {
      site_id: site.id,
      path: file.path,
      source_sha: file.sha,
      kind: "note",
      size: file.size,
      deleted_at: null,
    });

    try {
      const draft = parseNoteDraft({
        siteId: site.id,
        path: file.path,
        sourceSha: file.sha,
        markdown: file.text,
      });

      pendingNotes.push({
        draft,
        sourceMarkdown: file.text,
        parseError: null,
        conflictError: null,
      });
      summary.notesParsed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push({ path: file.path, message });
      await saveErroredNote(client, site.id, file.path, file.sha, message);
    }
  }

  await detectConflicts(site.id, pendingNotes);

  const resolverNotes = applyPendingResolverNotes(await listResolverNotes(site.id), pendingNotes);
  const assetResolver = buildAssetResolver(site, sourceFiles, changedAssets);

  for (const item of pendingNotes) {
    const error = item.parseError ?? item.conflictError;
    const shouldPublish = item.draft.publish && !error && item.draft.visibility !== "private";

    if (error) {
      summary.errors.push({ path: item.draft.path, message: error });
    }

    if (!shouldPublish) {
      const noteId = await upsertNote(client, {
        siteId: site.id,
        path: item.draft.path,
        sourceSha: item.draft.sourceSha,
        slug: item.draft.slug,
        title: item.draft.title,
        description: item.draft.description,
        publish: false,
        visibility: item.draft.visibility,
        frontmatter: item.draft.frontmatter,
        lumenote: item.draft.lumenote,
        bodyHash: item.draft.bodyHash,
        html: "",
        parseError: error,
      });
      await replaceNoteLinks(client, noteId, []);
      summary.notesUnpublished += 1;
      continue;
    }

    const rendered = await renderNoteDraft(item.draft, {
      resolveNote: buildNoteResolver(site, resolverNotes, item.draft.path),
      resolveAsset: assetResolver,
    });

    const noteId = await upsertNote(client, {
      siteId: site.id,
      path: item.draft.path,
      sourceSha: item.draft.sourceSha,
      slug: item.draft.slug,
      title: item.draft.title,
      description: item.draft.description,
      publish: true,
      visibility: item.draft.visibility,
      frontmatter: item.draft.frontmatter,
      lumenote: item.draft.lumenote,
      bodyHash: item.draft.bodyHash,
      html: rendered.html,
      parseError: null,
    });
    await replaceNoteLinks(client, noteId, rendered.outgoingLinks);
    summary.notesPublished += 1;
  }
}

export async function runChangedPathsIngest(input: ChangedPathsInput) {
  const site = await findSiteById(input.site_id);
  if (!site) {
    throw new Error(`Site not found: ${input.site_id}`);
  }

  assertRepositoryMatches(site, input.repository);
  await assertCommitOnBranch(site, input.after);

  const changes = normalizeChanges(input.changes);
  const key = idempotencyKey(input, changes);
  const existing = await findCompletedIngestRunByKey(key);

  if (existing) {
    return {
      ingest_run_id: existing.id,
      status: "accepted" as const,
      summary: existing.summary,
    };
  }

  const runId = newId("run");
  const summary = emptySummary(changes.length);

  await withTransaction(async (client) => {
    await createIngestRun(client, {
      id: runId,
      siteId: site.id,
      trigger: "github_action",
      beforeSha: input.before ?? null,
      afterSha: input.after,
      idempotencyKey: key,
    });

    try {
      await processChanges({
        site,
        ref: input.after,
        changes,
        client,
        summary,
      });
      await finishIngestRun(client, runId, "completed", summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push({ path: "*", message });
      await finishIngestRun(client, runId, "failed", summary);
      throw error;
    }
  });

  return {
    ingest_run_id: runId,
    status: "accepted" as const,
    summary,
  };
}

export async function runFullSync(input: {
  siteId: string;
  ref?: string;
  trigger: IngestTrigger;
}) {
  const site = await findSiteById(input.siteId);
  if (!site) {
    throw new Error(`Site not found: ${input.siteId}`);
  }

  const ref = input.ref ?? site.branch;
  const tree = await fetchRepositoryTree(site, ref);
  const candidateFiles = tree.filter((item) => isMarkdownPath(item.path) || isSupportedAssetPath(item.path));
  const existingFiles = await getSourceFileMap(site.id);
  const changes: ChangedPath[] = [];

  for (const file of candidateFiles) {
    const existing = existingFiles.get(file.path);
    if (!existing || existing.source_sha !== file.sha || existing.deleted_at) {
      changes.push({
        status: existing ? "modified" : "added",
        path: file.path,
      });
    }
    existingFiles.delete(file.path);
  }

  for (const [path, sourceFile] of existingFiles) {
    if (sourceFile.kind === "note" || sourceFile.kind === "asset") {
      changes.push({ status: "deleted", path });
    }
  }

  const runId = newId("run");
  const summary = emptySummary(changes.length);

  await withTransaction(async (client) => {
    await createIngestRun(client, {
      id: runId,
      siteId: site.id,
      trigger: input.trigger,
      beforeSha: null,
      afterSha: ref,
      idempotencyKey: null,
    });

    try {
      for (const file of candidateFiles) {
        const kind = fileKind(file.path);
        await upsertSourceFile(client, {
          site_id: site.id,
          path: file.path,
          source_sha: file.sha,
          kind,
          size: file.size,
          deleted_at: null,
        });
      }

      await processChanges({
        site,
        ref,
        changes,
        client,
        summary,
      });

      await finishIngestRun(client, runId, "completed", summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push({ path: "*", message });
      await finishIngestRun(client, runId, "failed", summary);
      throw error;
    }
  });

  return {
    ingest_run_id: runId,
    status: "accepted" as const,
    summary,
  };
}
