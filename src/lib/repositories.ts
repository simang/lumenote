import type { PoolClient } from "pg";
import { hashShareToken } from "./crypto";
import { query, queryOne } from "./db";
import { newId } from "./ids";
import type { GitHubInstallation, Note, NoteLink, Site, SourceFile, User, Visibility } from "./types";

export type UpsertSiteInput = {
  id?: string;
  userId: string;
  slug: string;
  name: string;
  owner: string;
  repo: string;
  branch: string;
  githubInstallationId: string;
};

export function countUsers() {
  return queryOne<{ count: number }>("select count(*)::int as count from users");
}

export function findUserByEmail(email: string) {
  return queryOne<User>("select * from users where lower(email) = lower($1)", [email]);
}

export function findUserById(userId: string) {
  return queryOne<User>("select * from users where id = $1", [userId]);
}

export async function createUser(email: string, passwordHash: string) {
  const row = await queryOne<User>(
    `
      insert into users(id, email, password_hash)
      values ($1, lower($2), $3)
      returning *
    `,
    [newId("user"), email, passwordHash],
  );

  if (!row) {
    throw new Error("Failed to create user");
  }

  return row;
}

export async function upsertUserByEmail(email: string, passwordHash: string) {
  const row = await queryOne<User>(
    `
      insert into users(id, email, password_hash)
      values ($1, lower($2), $3)
      on conflict (email) do update set
        password_hash = excluded.password_hash
      returning *
    `,
    [newId("user"), email, passwordHash],
  );

  if (!row) {
    throw new Error("Failed to upsert user");
  }

  return row;
}

export async function claimOrphanSitesForUser(userId: string) {
  await query("update sites set user_id = $1 where user_id is null", [userId]);
}

export async function upsertSite(input: UpsertSiteInput) {
  const id = input.id || newId("site");

  const row = await queryOne<Site>(
    `
      insert into sites(id, user_id, slug, name, owner, repo, branch, github_installation_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (id) do update set
        user_id = excluded.user_id,
        slug = excluded.slug,
        name = excluded.name,
        owner = excluded.owner,
        repo = excluded.repo,
        branch = excluded.branch,
        github_installation_id = excluded.github_installation_id
      where sites.user_id = excluded.user_id or sites.user_id is null
      returning *
    `,
    [
      id,
      input.userId,
      input.slug,
      input.name,
      input.owner,
      input.repo,
      input.branch,
      input.githubInstallationId,
    ],
  );

  if (!row) {
    throw new Error("Failed to upsert site");
  }

  return row;
}

export function findSiteById(siteId: string) {
  return queryOne<Site>("select * from sites where id = $1", [siteId]);
}

export function findSiteForUser(userId: string, siteId: string) {
  return queryOne<Site>(
    "select * from sites where id = $1 and user_id = $2",
    [siteId, userId],
  );
}

export function findSiteBySlug(slug: string) {
  return queryOne<Site>("select * from sites where slug = $1", [slug]);
}

export function listSites() {
  return query<Site>("select * from sites order by created_at desc");
}

export function listSitesForUser(userId: string) {
  return query<Site>(
    "select * from sites where user_id = $1 order by created_at desc",
    [userId],
  );
}

export function listRecentIngestRuns(limit = 20) {
  return query<{
    id: string;
    site_id: string;
    trigger: string;
    status: string;
    summary: Record<string, unknown>;
    started_at: Date;
    finished_at: Date | null;
  }>(
    `
      select id, site_id, trigger, status, summary, started_at, finished_at
      from ingest_runs
      order by started_at desc
      limit $1
    `,
    [limit],
  );
}

export function listRecentIngestRunsForUser(userId: string, limit = 20) {
  return query<{
    id: string;
    site_id: string;
    trigger: string;
    status: string;
    summary: Record<string, unknown>;
    started_at: Date;
    finished_at: Date | null;
  }>(
    `
      select ingest_runs.id, ingest_runs.site_id, ingest_runs.trigger, ingest_runs.status,
        ingest_runs.summary, ingest_runs.started_at, ingest_runs.finished_at
      from ingest_runs
      join sites on sites.id = ingest_runs.site_id
      where sites.user_id = $1
      order by ingest_runs.started_at desc
      limit $2
    `,
    [userId, limit],
  );
}

export function listPublishedNotes(limit = 100) {
  return query<Note>(
    `
      select *
      from notes
      where deleted_at is null and publish is true and parse_error is null
      order by updated_at desc
      limit $1
    `,
    [limit],
  );
}

export function listPublishedNotesForUser(userId: string, limit = 100) {
  return query<Note>(
    `
      select notes.*
      from notes
      join sites on sites.id = notes.site_id
      where sites.user_id = $1
        and notes.deleted_at is null
        and notes.publish is true
        and notes.parse_error is null
      order by notes.updated_at desc
      limit $2
    `,
    [userId, limit],
  );
}

export function findPublicNote(siteId: string, slug: string) {
  return queryOne<Note>(
    `
      select *
      from notes
      where site_id = $1
        and slug = $2
        and publish is true
        and visibility = 'public'
        and parse_error is null
        and deleted_at is null
    `,
    [siteId, slug],
  );
}

export async function findSharePage(token: string) {
  const tokenHash = hashShareToken(token);
  return queryOne<{
    share_id: string;
    expires_at: Date | null;
    site: Site;
    note: Note;
  }>(
    `
      select
        share_links.id as share_id,
        share_links.expires_at,
        to_jsonb(sites.*) as site,
        to_jsonb(notes.*) as note
      from share_links
      join notes on notes.id = share_links.note_id
      join sites on sites.id = share_links.site_id
      where share_links.token_hash = $1
        and share_links.revoked_at is null
        and (share_links.expires_at is null or share_links.expires_at > now())
        and notes.deleted_at is null
        and notes.publish is true
        and notes.visibility = 'unlisted'
        and notes.parse_error is null
    `,
    [tokenHash],
  );
}

export function listBacklinks(noteId: string) {
  return query<Pick<Note, "id" | "title" | "slug">>(
    `
      select distinct source_notes.id, source_notes.title, source_notes.slug
      from note_links
      join notes source_notes on source_notes.id = note_links.source_note_id
      where note_links.target_note_id = $1
        and note_links.status = 'resolved'
        and source_notes.publish is true
        and source_notes.visibility = 'public'
        and source_notes.deleted_at is null
        and source_notes.parse_error is null
      order by source_notes.title asc
    `,
    [noteId],
  );
}

export function listOutgoingPublicLinks(noteId: string) {
  return query<Pick<Note, "id" | "title" | "slug">>(
    `
      select distinct target_notes.id, target_notes.title, target_notes.slug
      from note_links
      join notes target_notes on target_notes.id = note_links.target_note_id
      where note_links.source_note_id = $1
        and note_links.status = 'resolved'
        and target_notes.publish is true
        and target_notes.visibility = 'public'
        and target_notes.deleted_at is null
        and target_notes.parse_error is null
      order by target_notes.title asc
    `,
    [noteId],
  );
}

export function listResolverNotes(siteId: string) {
  return query<Note>(
    `
      select *
      from notes
      where site_id = $1 and deleted_at is null
    `,
    [siteId],
  );
}

export function findConflictingSlug(siteId: string, slug: string, path: string) {
  return queryOne<Pick<Note, "id" | "path" | "slug">>(
    `
      select id, path, slug
      from notes
      where site_id = $1
        and slug = $2
        and path <> $3
        and deleted_at is null
        and parse_error is null
        and publish is true
      limit 1
    `,
    [siteId, slug, path],
  );
}

export async function createIngestRun(
  client: PoolClient,
  input: {
    id: string;
    siteId: string;
    trigger: "agent_api" | "github_action" | "admin_full_sync" | "manual";
    beforeSha?: string | null;
    afterSha: string;
    idempotencyKey?: string | null;
  },
) {
  await client.query(
    `
      insert into ingest_runs(id, site_id, trigger, before_sha, after_sha, idempotency_key, status)
      values ($1, $2, $3, $4, $5, $6, 'running')
    `,
    [
      input.id,
      input.siteId,
      input.trigger,
      input.beforeSha ?? null,
      input.afterSha,
      input.idempotencyKey ?? null,
    ],
  );
}

export function findCompletedIngestRunByKey(idempotencyKey: string) {
  return queryOne<{ id: string; status: string; summary: Record<string, unknown> }>(
    `
      select id, status, summary
      from ingest_runs
      where idempotency_key = $1 and status = 'completed'
    `,
    [idempotencyKey],
  );
}

export async function finishIngestRun(
  client: PoolClient,
  runId: string,
  status: "completed" | "failed",
  summary: Record<string, unknown>,
) {
  await client.query(
    `
      update ingest_runs
      set
        status = $2,
        summary = $3,
        finished_at = now(),
        idempotency_key = case when $2::text = 'failed' then null else idempotency_key end
      where id = $1
    `,
    [runId, status, JSON.stringify(summary)],
  );
}

export async function upsertSourceFile(
  client: PoolClient,
  sourceFile: SourceFile,
) {
  await client.query(
    `
      insert into source_files(site_id, path, source_sha, kind, size, deleted_at)
      values ($1, $2, $3, $4, $5, null)
      on conflict (site_id, path) do update set
        source_sha = excluded.source_sha,
        kind = excluded.kind,
        size = excluded.size,
        deleted_at = null
    `,
    [
      sourceFile.site_id,
      sourceFile.path,
      sourceFile.source_sha,
      sourceFile.kind,
      sourceFile.size,
    ],
  );
}

export async function markSourceDeleted(client: PoolClient, siteId: string, path: string) {
  await client.query(
    "update source_files set deleted_at = now() where site_id = $1 and path = $2",
    [siteId, path],
  );
  await client.query(
    `
      update notes
      set deleted_at = now(), publish = false, published_at = null
      where site_id = $1 and path = $2 and deleted_at is null
    `,
    [siteId, path],
  );
  await client.query(
    "update assets set deleted_at = now() where site_id = $1 and path = $2",
    [siteId, path],
  );
}

export async function upsertAsset(
  client: PoolClient,
  asset: {
    siteId: string;
    path: string;
    sourceSha: string;
    contentType: string;
    size: number;
  },
) {
  const existing = await client.query<{ id: string }>(
    "select id from assets where site_id = $1 and path = $2",
    [asset.siteId, asset.path],
  );
  const id = existing.rows[0]?.id ?? newId("asset");

  await client.query(
    `
      insert into assets(id, site_id, path, source_sha, content_type, size, storage_key, deleted_at)
      values ($1, $2, $3, $4, $5, $6, null, null)
      on conflict (site_id, path) do update set
        source_sha = excluded.source_sha,
        content_type = excluded.content_type,
        size = excluded.size,
        deleted_at = null
    `,
    [id, asset.siteId, asset.path, asset.sourceSha, asset.contentType, asset.size],
  );
}

export async function upsertNote(
  client: PoolClient,
  note: {
    id?: string;
    siteId: string;
    path: string;
    sourceSha: string;
    slug: string;
    title: string;
    description: string | null;
    publish: boolean;
    visibility: Visibility;
    frontmatter: Record<string, unknown>;
    lumenote: Record<string, unknown>;
    bodyHash: string;
    html: string;
    parseError: string | null;
  },
) {
  const existing = await client.query<{ id: string }>(
    "select id from notes where site_id = $1 and path = $2",
    [note.siteId, note.path],
  );
  const id = note.id ?? existing.rows[0]?.id ?? newId("note");

  await client.query(
    `
      insert into notes(
        id, site_id, path, source_sha, slug, title, description, publish, visibility,
        frontmatter, lumenote, body_hash, html, parse_error, published_at, deleted_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8::boolean, $9, $10::jsonb, $11::jsonb,
        $12, $13, $14::text,
        case when $8::boolean is true and $14::text is null then now() else null end,
        null
      )
      on conflict (site_id, path) do update set
        source_sha = excluded.source_sha,
        slug = excluded.slug,
        title = excluded.title,
        description = excluded.description,
        publish = excluded.publish,
        visibility = excluded.visibility,
        frontmatter = excluded.frontmatter,
        lumenote = excluded.lumenote,
        body_hash = excluded.body_hash,
        html = excluded.html,
        parse_error = excluded.parse_error,
        published_at = case
          when excluded.publish is true and excluded.parse_error is null then coalesce(notes.published_at, now())
          else null
        end,
        deleted_at = null
      returning id
    `,
    [
      id,
      note.siteId,
      note.path,
      note.sourceSha,
      note.slug,
      note.title,
      note.description,
      note.publish,
      note.visibility,
      JSON.stringify(note.frontmatter),
      JSON.stringify(note.lumenote),
      note.bodyHash,
      note.html,
      note.parseError,
    ],
  );

  return id;
}

export async function replaceNoteLinks(client: PoolClient, noteId: string, links: NoteLink[]) {
  await client.query("delete from note_links where source_note_id = $1", [noteId]);

  for (const link of links) {
    await client.query(
      `
        insert into note_links(site_id, source_note_id, target_path, target_note_id, label, raw, status)
        select site_id, id, $2, $3, $4, $5, $6
        from notes
        where id = $1
      `,
      [noteId, link.targetPath, link.targetNoteId, link.label, link.raw, link.status],
    );
  }
}

export async function getSourceFileMap(siteId: string) {
  const rows = await query<SourceFile>(
    `
      select *
      from source_files
      where site_id = $1 and deleted_at is null
    `,
    [siteId],
  );

  return new Map(rows.map((row) => [row.path, row]));
}

export async function findAssetForRequest(siteId: string, sourceRef: string, assetPath: string) {
  return queryOne<{
    site: Site;
    path: string;
    source_sha: string;
    content_type: string;
  }>(
    `
      select
        to_jsonb(sites.*) as site,
        assets.path,
        assets.source_sha,
        assets.content_type
      from assets
      join sites on sites.id = assets.site_id
      where assets.site_id = $1
        and assets.path = $3
        and assets.deleted_at is null
        and ($2 = 'current' or assets.source_sha = $2)
      limit 1
    `,
    [siteId, sourceRef, assetPath],
  );
}

export async function createShareLink(noteId: string, tokenHash: string) {
  const note = await queryOne<Pick<Note, "site_id" | "visibility" | "publish" | "deleted_at">>(
    "select site_id, visibility, publish, deleted_at from notes where id = $1",
    [noteId],
  );

  if (!note || note.deleted_at || !note.publish || note.visibility !== "unlisted") {
    throw new Error("Share links can only be created for published unlisted notes");
  }

  const row = await queryOne<{ id: string; site_id: string }>(
    `
      insert into share_links(id, site_id, note_id, token_hash)
      values ($1, $2, $3, $4)
      returning id, site_id
    `,
    [newId("share"), note.site_id, noteId, tokenHash],
  );

  if (!row) {
    throw new Error("Failed to create share link");
  }

  return row;
}

export async function createShareLinkForUser(userId: string, noteId: string, tokenHash: string) {
  const note = await queryOne<Pick<Note, "site_id" | "visibility" | "publish" | "deleted_at">>(
    `
      select notes.site_id, notes.visibility, notes.publish, notes.deleted_at
      from notes
      join sites on sites.id = notes.site_id
      where notes.id = $1 and sites.user_id = $2
    `,
    [noteId, userId],
  );

  if (!note || note.deleted_at || !note.publish || note.visibility !== "unlisted") {
    throw new Error("Share links can only be created for owned published unlisted notes");
  }

  const row = await queryOne<{ id: string; site_id: string }>(
    `
      insert into share_links(id, site_id, note_id, token_hash)
      values ($1, $2, $3, $4)
      returning id, site_id
    `,
    [newId("share"), note.site_id, noteId, tokenHash],
  );

  if (!row) {
    throw new Error("Failed to create share link");
  }

  return row;
}

export async function upsertGitHubInstallation(input: {
  userId: string;
  githubInstallationId: string;
  accountLogin?: string | null;
  accountType?: string | null;
  repositorySelection?: string | null;
}) {
  const row = await queryOne<GitHubInstallation>(
    `
      insert into github_installations(
        id, user_id, github_installation_id, account_login, account_type, repository_selection
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (github_installation_id) do update set
        user_id = excluded.user_id,
        account_login = excluded.account_login,
        account_type = excluded.account_type,
        repository_selection = excluded.repository_selection
      returning *
    `,
    [
      newId("install"),
      input.userId,
      input.githubInstallationId,
      input.accountLogin ?? null,
      input.accountType ?? null,
      input.repositorySelection ?? null,
    ],
  );

  if (!row) {
    throw new Error("Failed to upsert GitHub installation");
  }

  return row;
}

export function listGitHubInstallationsForUser(userId: string) {
  return query<GitHubInstallation>(
    `
      select *
      from github_installations
      where user_id = $1
      order by updated_at desc
    `,
    [userId],
  );
}

export function findGitHubInstallationForUser(userId: string, githubInstallationId: string) {
  return queryOne<GitHubInstallation>(
    `
      select *
      from github_installations
      where user_id = $1 and github_installation_id = $2
    `,
    [userId, githubInstallationId],
  );
}
