import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { appUrlFromRequest } from "@/lib/config";
import {
  findOwnerNoteForSiteForUser,
  findSiteWithIngestTokenForUser,
  listOwnerBacklinksForNoteForUser,
  listOwnerNotesForSiteForUser,
  listOwnerOutgoingLinksForNoteForUser,
  listRecentIngestJobsForSiteForUser,
  listSitesForUser,
} from "@/lib/repositories";
import {
  displayPropertiesForEntry,
  displayProperty,
  filterEntriesBySelection,
  loadTolariaViews,
  queryEntries,
  rewriteOwnerNoteLinks,
  selectedView,
  sortEntries,
  sortForSelection,
  toOwnerVaultEntries,
  typeDefinitions,
  visibleTypes,
  type OwnerVaultEntry,
  type VaultFilter,
  type VaultSelection,
  type ViewFile,
} from "@/lib/vault-reader";

export const dynamic = "force-dynamic";

type NotesSearchParams = {
  filter?: string;
  job_empty?: string;
  job_existing?: string;
  job_processed?: string;
  job_queued?: string;
  note?: string;
  q?: string;
  token_error?: string;
  token_revoked?: string;
  token_rotated?: string;
  type?: string;
  view?: string;
};

const VAULT_FILTERS = new Set<VaultFilter>(["all", "inbox", "favorites", "archived"]);

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function selectionFromParams(params: NotesSearchParams, views: ViewFile[]): VaultSelection {
  if (params.view && views.some((view) => view.filename === params.view)) {
    return { kind: "view", filename: params.view };
  }

  if (params.type) {
    return { kind: "type", type: params.type };
  }

  const filter = params.filter && VAULT_FILTERS.has(params.filter as VaultFilter)
    ? (params.filter as VaultFilter)
    : "all";

  return { kind: "filter", filter };
}

function selectionTitle(selection: VaultSelection, views: ViewFile[]) {
  if (selection.kind === "view") {
    return views.find((view) => view.filename === selection.filename)?.definition.name ?? "View";
  }

  if (selection.kind === "type") {
    return selection.type;
  }

  if (selection.filter === "inbox") {
    return "Inbox";
  }

  if (selection.filter === "favorites") {
    return "Favorites";
  }

  if (selection.filter === "archived") {
    return "Archive";
  }

  return "All notes";
}

function selectionParams(selection: VaultSelection) {
  const params = new URLSearchParams();

  if (selection.kind === "view") {
    params.set("view", selection.filename);
  } else if (selection.kind === "type") {
    params.set("type", selection.type);
  } else if (selection.filter !== "all") {
    params.set("filter", selection.filter);
  }

  return params;
}

function notesPath(siteId: string, selection?: VaultSelection, noteId?: string, query?: string) {
  const params = selection ? selectionParams(selection) : new URLSearchParams();
  if (noteId) {
    params.set("note", noteId);
  }
  if (query?.trim()) {
    params.set("q", query.trim());
  }

  const suffix = params.size ? `?${params.toString()}` : "";
  return `/dashboard/sites/${encodeURIComponent(siteId)}/notes${suffix}`;
}

function selectedNoteId(params: NotesSearchParams, entries: OwnerVaultEntry[]) {
  if (params.note && entries.some((entry) => entry.id === params.note)) {
    return params.note;
  }

  return entries[0]?.id ?? null;
}

function navClass(active: boolean) {
  return active ? "vault-nav-item active" : "vault-nav-item";
}

function noteRowClass(active: boolean) {
  return active ? "vault-note-row active" : "vault-note-row";
}

function countEntries(entries: OwnerVaultEntry[], filter: VaultFilter) {
  return filterEntriesBySelection(entries, [], { kind: "filter", filter }).length;
}

function propertyChips(entry: OwnerVaultEntry, keys: string[]) {
  return keys
    .map((key) => ({ key, value: displayProperty(entry, key) }))
    .filter((item) => item.value);
}

function entryTypeStyle(entry: OwnerVaultEntry, definitions: Map<string, OwnerVaultEntry>) {
  const definition = definitions.get(entry.noteType);
  const color = definition?.color ?? null;

  return {
    backgroundColor: color ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined,
    color: color ?? undefined,
  };
}

function typeDotStyle(definition: OwnerVaultEntry | null) {
  return {
    backgroundColor: definition?.color ?? "var(--accent)",
  };
}

function humanizePropertyKey(key: string) {
  return key
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatPropertyValue).join(", ") : "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatShortSha(value: string) {
  return value.length > 12 ? value.slice(0, 12) : value;
}

function targetStem(value: string) {
  return value
    .split("#")[0]
    .replace(/^\[\[/, "")
    .replace(/]]$/, "")
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase();
}

function filenameStem(path: string) {
  return path.split("/").pop()?.replace(/\.md$/i, "").toLowerCase() ?? "";
}

function findEntryForRelationshipTarget(entries: OwnerVaultEntry[], target: string) {
  const normalized = targetStem(target);
  if (!normalized) {
    return null;
  }

  return entries.find((entry) => {
    const pathWithoutExtension = entry.path.replace(/\.md$/i, "").toLowerCase();
    return (
      entry.title.toLowerCase() === normalized ||
      entry.slug.toLowerCase() === normalized ||
      pathWithoutExtension === normalized ||
      filenameStem(entry.path) === normalized
    );
  }) ?? null;
}

function InspectorRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="vault-inspector-row">
      <dt>{label}</dt>
      <dd>{formatPropertyValue(value)}</dd>
    </div>
  );
}

function InspectorLinkList({
  entries,
  siteId,
}: {
  entries: Array<{ id: string; title: string; path: string }>;
  siteId: string;
}) {
  if (entries.length === 0) {
    return <p className="muted vault-inspector-empty">None</p>;
  }

  return (
    <ul className="vault-inspector-link-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link href={notesPath(siteId, { kind: "filter", filter: "all" }, entry.id)}>
            {entry.title}
          </Link>
          <span className="muted">{entry.path}</span>
        </li>
      ))}
    </ul>
  );
}

function OwnerPropertiesPanel({
  siteId,
  selectedEntry,
  selectedNote,
  entries,
  outgoingLinks,
  backlinks,
}: {
  siteId: string;
  selectedEntry: OwnerVaultEntry;
  selectedNote: NonNullable<Awaited<ReturnType<typeof findOwnerNoteForSiteForUser>>>;
  entries: OwnerVaultEntry[];
  outgoingLinks: Array<{ id: string; title: string; path: string }>;
  backlinks: Array<{ id: string; title: string; path: string }>;
}) {
  const customProperties = Object.entries(selectedEntry.properties).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const relationships = Object.entries(selectedEntry.relationships).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const rawFrontmatter = Object.entries(selectedNote.frontmatter ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return (
    <details className="vault-properties-panel">
      <summary>
        <span>Properties</span>
        <span className="muted">
          {selectedEntry.noteType}
          {selectedEntry.status ? ` · ${selectedEntry.status}` : ""}
        </span>
      </summary>
      <div className="vault-inspector-body">
        <section className="vault-inspector-section">
          <h2>Note</h2>
          <dl>
            <InspectorRow label="Type" value={selectedEntry.noteType} />
            <InspectorRow label="Status" value={selectedEntry.status} />
            <InspectorRow label="Visibility" value={selectedEntry.visibility} />
            <InspectorRow label="Publish" value={selectedEntry.publish} />
            <InspectorRow label="Favorite" value={selectedEntry.favorite} />
            <InspectorRow label="Organized" value={selectedEntry.organized} />
          </dl>
        </section>

        <section className="vault-inspector-section">
          <h2>Properties</h2>
          {customProperties.length === 0 ? (
            <p className="muted vault-inspector-empty">No custom properties.</p>
          ) : (
            <dl>
              {customProperties.map(([key, value]) => (
                <InspectorRow key={key} label={humanizePropertyKey(key)} value={value} />
              ))}
            </dl>
          )}
        </section>

        <section className="vault-inspector-section">
          <h2>Relationships</h2>
          {relationships.length === 0 ? (
            <p className="muted vault-inspector-empty">No relationship properties.</p>
          ) : (
            <div className="vault-relationship-list">
              {relationships.map(([key, targets]) => (
                <div className="vault-relationship-group" key={key}>
                  <h3>{humanizePropertyKey(key)}</h3>
                  <ul>
                    {targets.map((target) => {
                      const targetEntry = findEntryForRelationshipTarget(entries, target);

                      return (
                        <li key={target}>
                          {targetEntry ? (
                            <Link href={notesPath(siteId, { kind: "filter", filter: "all" }, targetEntry.id)}>
                              {targetEntry.title}
                            </Link>
                          ) : (
                            <span>{target}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="vault-inspector-section">
          <h2>Links</h2>
          <div className="vault-inspector-columns">
            <div>
              <h3>Outgoing</h3>
              <InspectorLinkList entries={outgoingLinks} siteId={siteId} />
            </div>
            <div>
              <h3>Backlinks</h3>
              <InspectorLinkList entries={backlinks} siteId={siteId} />
            </div>
          </div>
        </section>

        <section className="vault-inspector-section">
          <h2>File info</h2>
          <dl>
            <InspectorRow label="Path" value={selectedEntry.path} />
            <InspectorRow label="Slug" value={selectedEntry.slug} />
            <InspectorRow label="Updated" value={selectedEntry.updatedAt} />
            <InspectorRow label="Created" value={selectedEntry.createdAt} />
            <InspectorRow label="Source SHA" value={formatShortSha(selectedNote.source_sha)} />
            <InspectorRow label="Body Hash" value={formatShortSha(selectedNote.body_hash)} />
          </dl>
        </section>

        <details className="vault-raw-frontmatter">
          <summary>Raw frontmatter</summary>
          {rawFrontmatter.length === 0 ? (
            <p className="muted vault-inspector-empty">No frontmatter.</p>
          ) : (
            <dl>
              {rawFrontmatter.map(([key, value]) => (
                <InspectorRow key={key} label={key} value={value} />
              ))}
            </dl>
          )}
        </details>
      </div>
    </details>
  );
}

type VaultToolbarProps = {
  site: NonNullable<Awaited<ReturnType<typeof findSiteWithIngestTokenForUser>>>;
  sites: Awaited<ReturnType<typeof listSitesForUser>>;
  currentPath: string;
  appUrl: string;
  activeJob: Awaited<ReturnType<typeof listRecentIngestJobsForSiteForUser>>[number] | null;
};

function VaultStatusNotices({ query }: { query: NotesSearchParams }) {
  return (
    <>
      {query.job_queued ? (
        <section className="card stack compact">
          <p className="muted">Full sync job queued: {query.job_queued}</p>
        </section>
      ) : null}
      {query.job_existing ? (
        <section className="card stack compact">
          <p className="muted">A full sync job is already active: {query.job_existing}</p>
        </section>
      ) : null}
      {query.job_processed ? (
        <section className="card stack compact">
          <p className="muted">Ingest job processed: {query.job_processed}</p>
        </section>
      ) : null}
      {query.job_empty ? (
        <section className="card stack compact">
          <p className="muted">No queued ingest jobs for this site.</p>
        </section>
      ) : null}
      {query.token_rotated ? (
        <section className="card stack compact">
          <p className="muted">Agent ingest token is ready. Copy it before rotating again.</p>
        </section>
      ) : null}
      {query.token_revoked ? (
        <section className="card stack compact">
          <p className="muted">Agent ingest token revoked.</p>
        </section>
      ) : null}
      {query.token_error ? (
        <section className="card stack compact">
          <p className="danger">Agent token action failed.</p>
        </section>
      ) : null}
    </>
  );
}

function VaultToolbar({ site, sites, currentPath, appUrl, activeJob }: VaultToolbarProps) {
  const agentEnv = site.ingest_token
    ? [
        `export LUMENOTE_API_URL="${appUrl}"`,
        `export LUMENOTE_SITE_ID="${site.id}"`,
        `export LUMENOTE_SITE_TOKEN="${site.ingest_token}"`,
      ].join("\n")
    : "";

  return (
    <section className="vault-toolbar">
      <div className="vault-toolbar-title">
        <strong>{site.name}</strong>
        <span className="muted">
          {site.owner}/{site.repo}@{site.branch}
        </span>
      </div>

      <div className="vault-toolbar-actions">
        <details className="vault-toolbar-menu">
          <summary>Sites</summary>
          <div className="vault-menu-panel">
            {sites.map((candidate) => (
              <Link
                className={candidate.id === site.id ? "vault-menu-item active" : "vault-menu-item"}
                href={`/dashboard/sites/${candidate.id}/notes`}
                key={candidate.id}
              >
                <span>{candidate.name}</span>
                <span className="muted">
                  {candidate.owner}/{candidate.repo}
                </span>
              </Link>
            ))}
            <Link className="vault-menu-item" href="/vault?setup=1">
              <span>Connect another vault</span>
              <span className="muted">GitHub App setup</span>
            </Link>
          </div>
        </details>

        <form action="/api/ingest/full-sync" method="post">
          <input name="site_id" type="hidden" value={site.id} />
          <input name="ref" type="hidden" value={site.branch} />
          <input name="redirect_to" type="hidden" value={currentPath} />
          <button className="secondary" type="submit">
            Queue sync
          </button>
        </form>
        <form action="/api/ingest/jobs/run" method="post">
          <input name="site_id" type="hidden" value={site.id} />
          <input name="redirect_to" type="hidden" value={currentPath} />
          <button className="secondary" type="submit">
            Run sync
          </button>
        </form>

        <Link className="button secondary" href={`/p/${site.slug}`}>
          Public
        </Link>

        <details className="vault-toolbar-menu vault-settings-menu">
          <summary>Settings</summary>
          <div className="vault-menu-panel vault-settings-panel">
            <section className="stack compact">
              <h2>Site settings</h2>
              <form action="/api/sites" method="post">
                <input name="id" type="hidden" value={site.id} />
                <input name="redirect_to" type="hidden" value={currentPath} />
                <label>
                  Site slug
                  <input name="slug" defaultValue={site.slug} required />
                </label>
                <label>
                  Name
                  <input name="name" defaultValue={site.name} required />
                </label>
                <label>
                  GitHub owner
                  <input name="owner" defaultValue={site.owner} required />
                </label>
                <label>
                  GitHub repo
                  <input name="repo" defaultValue={site.repo} required />
                </label>
                <label>
                  Branch
                  <input name="branch" defaultValue={site.branch} required />
                </label>
                <label>
                  GitHub installation id
                  <input name="github_installation_id" defaultValue={site.github_installation_id} required />
                </label>
                <button type="submit">Save settings</button>
              </form>
            </section>

            <section className="stack compact">
              <h2>Agent ingest</h2>
              {site.ingest_token ? (
                <>
                  <textarea aria-label="Agent environment variables" readOnly rows={4} value={agentEnv} />
                  <p className="muted">Active token: ****{site.ingest_token_last_four}</p>
                </>
              ) : site.ingest_token_hash ? (
                <p className="muted">
                  This site has an ingest token, but it cannot be decrypted with the current environment.
                  Rotate it to copy a fresh token.
                </p>
              ) : (
                <p className="muted">No site-specific ingest token has been issued.</p>
              )}
              <div className="row compact-row">
                <form action="/api/sites/ingest-token" method="post">
                  <input name="intent" type="hidden" value="rotate" />
                  <input name="site_id" type="hidden" value={site.id} />
                  <input name="redirect_to" type="hidden" value={currentPath} />
                  <button className="secondary" type="submit">
                    {site.ingest_token_hash ? "Rotate token" : "Generate token"}
                  </button>
                </form>
                <form action="/api/sites/ingest-token" method="post">
                  <input name="intent" type="hidden" value="revoke" />
                  <input name="site_id" type="hidden" value={site.id} />
                  <input name="redirect_to" type="hidden" value={currentPath} />
                  <button className="secondary danger-button" disabled={!site.ingest_token_hash} type="submit">
                    Revoke token
                  </button>
                </form>
              </div>
            </section>

            <section className="stack compact">
              <h2>Sync status</h2>
              {activeJob ? (
                <p className="muted">
                  Active job: {activeJob.id} · {activeJob.status}
                </p>
              ) : (
                <p className="muted">No active full sync job.</p>
              )}
              <Link href={`/dashboard/sites/${site.id}`}>Open legacy settings page</Link>
            </section>
          </div>
        </details>

        <form action="/api/auth/logout" method="post">
          <button className="secondary" type="submit">
            Logout
          </button>
        </form>
      </div>
    </section>
  );
}

export default async function OwnerVaultNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<NotesSearchParams>;
}) {
  const user = await requireUser();
  const { siteId } = await params;
  const query = await searchParams;
  const site = await findSiteWithIngestTokenForUser(user.id, siteId);

  if (!site) {
    notFound();
  }

  const [noteRows, loadedViews, sites, jobs] = await Promise.all([
    listOwnerNotesForSiteForUser(user.id, site.id),
    loadTolariaViews(site),
    listSitesForUser(user.id),
    listRecentIngestJobsForSiteForUser(user.id, site.id, 10),
  ]);
  const entries = toOwnerVaultEntries(noteRows);
  const definitions = typeDefinitions(entries);
  const selection = selectionFromParams(query, loadedViews.views);
  const view = selectedView(selection, loadedViews.views);
  const searchedEntries = sortEntries(
    queryEntries(filterEntriesBySelection(entries, loadedViews.views, selection), query.q ?? ""),
    sortForSelection(selection, loadedViews.views, definitions),
  );
  const selectedId = selectedNoteId(query, searchedEntries);
  const [selectedNote, outgoingLinks, backlinks] = selectedId
    ? await Promise.all([
        findOwnerNoteForSiteForUser(user.id, site.id, selectedId),
        listOwnerOutgoingLinksForNoteForUser(user.id, site.id, selectedId),
        listOwnerBacklinksForNoteForUser(user.id, site.id, selectedId),
      ])
    : [null, [], []] as const;
  const selectedEntry = selectedNote ? entries.find((entry) => entry.id === selectedNote.id) ?? null : null;
  const title = selectionTitle(selection, loadedViews.views);
  const ownerHtml = selectedNote
    ? rewriteOwnerNoteLinks(selectedNote.html, {
        siteId: site.id,
        siteSlug: site.slug,
        entries,
      })
    : "";
  const types = visibleTypes(entries);
  const activeCount = countEntries(entries, "all");
  const inboxCount = countEntries(entries, "inbox");
  const favoritesCount = countEntries(entries, "favorites");
  const archivedCount = countEntries(entries, "archived");
  const currentPath = notesPath(site.id, selection, selectedId ?? undefined, query.q);
  const activeJob = jobs.find((job) => job.status === "queued" || job.status === "running") ?? null;
  const appUrl = appUrlFromRequest();

  return (
    <main className="vault-main stack">
      <VaultToolbar
        site={site}
        sites={sites}
        currentPath={currentPath}
        appUrl={appUrl}
        activeJob={activeJob}
      />
      <VaultStatusNotices query={query} />

      {loadedViews.error ? (
        <section className="card stack compact">
          <p className="danger">Saved views could not be loaded from GitHub.</p>
          <p className="muted">{loadedViews.error}</p>
        </section>
      ) : null}

      <section className="vault-reader">
        <aside className="vault-sidebar">
          <nav className="vault-nav-group">
            <Link className={navClass(selection.kind === "filter" && selection.filter === "inbox")} href={notesPath(site.id, { kind: "filter", filter: "inbox" })}>
              <span>Inbox</span>
              <span className="vault-count">{inboxCount}</span>
            </Link>
            <Link className={navClass(selection.kind === "filter" && selection.filter === "all")} href={notesPath(site.id, { kind: "filter", filter: "all" })}>
              <span>All Notes</span>
              <span className="vault-count">{activeCount}</span>
            </Link>
            <Link className={navClass(selection.kind === "filter" && selection.filter === "favorites")} href={notesPath(site.id, { kind: "filter", filter: "favorites" })}>
              <span>Favorites</span>
              <span className="vault-count">{favoritesCount}</span>
            </Link>
            <Link className={navClass(selection.kind === "filter" && selection.filter === "archived")} href={notesPath(site.id, { kind: "filter", filter: "archived" })}>
              <span>Archive</span>
              <span className="vault-count">{archivedCount}</span>
            </Link>
          </nav>

          {loadedViews.views.length > 0 ? (
            <section className="vault-nav-section">
              <h2>Views</h2>
              <nav className="vault-nav-group">
                {loadedViews.views.map((item) => {
                  const count = filterEntriesBySelection(entries, loadedViews.views, {
                    kind: "view",
                    filename: item.filename,
                  }).length;

                  return (
                    <Link
                      className={navClass(selection.kind === "view" && selection.filename === item.filename)}
                      href={notesPath(site.id, { kind: "view", filename: item.filename })}
                      key={item.filename}
                    >
                      <span className="vault-nav-label">
                        <span className="vault-dot" style={{ backgroundColor: item.definition.color ?? "var(--accent)" }} />
                        {item.definition.name}
                      </span>
                      <span className="vault-count">{count}</span>
                    </Link>
                  );
                })}
              </nav>
            </section>
          ) : null}

          {favoritesCount > 0 ? (
            <section className="vault-nav-section">
              <h2>Favorite Notes</h2>
              <nav className="vault-nav-group">
                {entries
                  .filter((entry) => entry.favorite && !entry.archived)
                  .sort((left, right) => (left.favoriteIndex ?? Infinity) - (right.favoriteIndex ?? Infinity))
                  .map((entry) => (
                    <Link
                      className={navClass(selectedEntry?.id === entry.id)}
                      href={notesPath(site.id, { kind: "filter", filter: "favorites" }, entry.id)}
                      key={entry.id}
                    >
                      <span className="vault-nav-label">
                        <span className="vault-dot" style={typeDotStyle(definitions.get(entry.noteType) ?? null)} />
                        {entry.title}
                      </span>
                    </Link>
                  ))}
              </nav>
            </section>
          ) : null}

          <section className="vault-nav-section">
            <h2>Types</h2>
            <nav className="vault-nav-group">
              {types.map((item) => (
                <Link
                  className={navClass(selection.kind === "type" && selection.type === item.type)}
                  href={notesPath(site.id, { kind: "type", type: item.type })}
                  key={item.type}
                >
                  <span className="vault-nav-label">
                    <span className="vault-dot" style={typeDotStyle(item.definition)} />
                    {item.type}
                  </span>
                  <span className="vault-count">{item.count}</span>
                </Link>
              ))}
            </nav>
          </section>
        </aside>

        <section className="vault-list">
          <header className="vault-list-header">
            <div>
              <h2>{title}</h2>
              <p className="muted">
                {searchedEntries.length} note{searchedEntries.length === 1 ? "" : "s"}
              </p>
            </div>
            <form action={notesPath(site.id)} method="get">
              {selection.kind === "filter" && selection.filter !== "all" ? <input name="filter" type="hidden" value={selection.filter} /> : null}
              {selection.kind === "type" ? <input name="type" type="hidden" value={selection.type} /> : null}
              {selection.kind === "view" ? <input name="view" type="hidden" value={selection.filename} /> : null}
              <input aria-label="Search notes" name="q" placeholder="Search notes" defaultValue={query.q ?? ""} />
            </form>
          </header>

          <div className="vault-note-list" role="listbox" aria-label="Notes">
            {searchedEntries.length === 0 ? (
              <p className="muted vault-empty">No notes in this selection.</p>
            ) : (
              searchedEntries.map((entry) => {
                const active = selectedNote?.id === entry.id || (!selectedNote && selectedId === entry.id);
                const chips = propertyChips(entry, displayPropertiesForEntry(entry, definitions, view));

                return (
                  <Link
                    className={noteRowClass(active)}
                    href={notesPath(site.id, selection, entry.id, query.q)}
                    key={entry.id}
                    role="option"
                    aria-selected={active}
                  >
                    <span className="vault-note-title">
                      <span className="vault-dot" style={typeDotStyle(definitions.get(entry.noteType) ?? null)} />
                      {entry.title}
                    </span>
                    <span className="vault-note-meta">
                      {formatDate(entry.updatedAt)} · {entry.noteType}
                      {entry.status ? ` · ${entry.status}` : ""}
                    </span>
                    {entry.snippet ? <span className="vault-note-snippet">{entry.snippet}</span> : null}
                    {chips.length > 0 ? (
                      <span className="vault-chip-row">
                        {chips.map((chip) => (
                          <span className="vault-chip" key={chip.key} style={entryTypeStyle(entry, definitions)}>
                            {chip.key}: {chip.value}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className="vault-note-path">{entry.path}</span>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="vault-content note-shell">
          {selectedNote && selectedEntry ? (
            <article>
              <header className="stack compact">
                <div className="row">
                  <span className="badge">{selectedEntry.noteType}</span>
                  <span className="muted">{selectedEntry.visibility}</span>
                </div>
                <h1>{selectedNote.title}</h1>
                {selectedNote.description ? <p className="muted">{selectedNote.description}</p> : null}
                <p className="muted">{selectedNote.path}</p>
                {selectedNote.parse_error ? <p className="danger">Parse error: {selectedNote.parse_error}</p> : null}
              </header>
              <OwnerPropertiesPanel
                siteId={site.id}
                selectedEntry={selectedEntry}
                selectedNote={selectedNote}
                entries={entries}
                outgoingLinks={outgoingLinks}
                backlinks={backlinks}
              />
              <section dangerouslySetInnerHTML={{ __html: ownerHtml }} />
              <footer className="note-links">
                {outgoingLinks.length > 0 ? (
                  <section>
                    <h2>Outgoing links</h2>
                    <ul>
                      {outgoingLinks.map((target) => (
                        <li key={target.id}>
                          <Link href={notesPath(site.id, { kind: "filter", filter: "all" }, target.id)}>
                            {target.title}
                          </Link>{" "}
                          <span className="muted">{target.path}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {backlinks.length > 0 ? (
                  <section>
                    <h2>Backlinks</h2>
                    <ul>
                      {backlinks.map((source) => (
                        <li key={source.id}>
                          <Link href={notesPath(site.id, { kind: "filter", filter: "all" }, source.id)}>
                            {source.title}
                          </Link>{" "}
                          <span className="muted">{source.path}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </footer>
            </article>
          ) : (
            <article>
              <h1>No note selected</h1>
              <p className="muted">Choose a note from the list.</p>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}
