create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists github_installations (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  github_installation_id text not null unique,
  account_login text,
  account_type text,
  repository_selection text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sites (
  id text primary key,
  user_id text references users(id) on delete cascade,
  slug text not null unique,
  name text not null,
  owner text not null,
  repo text not null,
  branch text not null default 'main',
  github_installation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_files (
  site_id text not null references sites(id) on delete cascade,
  path text not null,
  source_sha text not null,
  kind text not null check (kind in ('note', 'asset', 'other')),
  size integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, path)
);

create table if not exists notes (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  path text not null,
  source_sha text not null,
  slug text not null,
  title text not null,
  description text,
  publish boolean not null default false,
  visibility text not null check (visibility in ('public', 'unlisted', 'private')),
  frontmatter jsonb not null default '{}'::jsonb,
  lumenote jsonb not null default '{}'::jsonb,
  body_hash text not null,
  html text not null default '',
  parse_error text,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, path)
);

create unique index if not exists notes_site_slug_live_idx
  on notes(site_id, slug)
  where deleted_at is null and parse_error is null and publish is true;

create table if not exists note_links (
  site_id text not null references sites(id) on delete cascade,
  source_note_id text not null references notes(id) on delete cascade,
  target_path text,
  target_note_id text references notes(id) on delete set null,
  label text not null,
  raw text not null,
  status text not null check (status in ('resolved', 'unresolved', 'private', 'ambiguous')),
  created_at timestamptz not null default now()
);

create index if not exists note_links_target_note_id_idx
  on note_links(site_id, target_note_id);

create table if not exists assets (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  path text not null,
  source_sha text not null,
  content_type text not null,
  size integer not null default 0,
  storage_key text,
  public_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, path)
);

create table if not exists share_links (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  note_id text not null references notes(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ingest_runs (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  trigger text not null check (trigger in ('agent_api', 'github_action', 'admin_full_sync', 'manual')),
  before_sha text,
  after_sha text not null,
  idempotency_key text unique,
  status text not null check (status in ('accepted', 'running', 'completed', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sites_set_updated_at on sites;
create trigger sites_set_updated_at
before update on sites
for each row execute function set_updated_at();

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

drop trigger if exists github_installations_set_updated_at on github_installations;
create trigger github_installations_set_updated_at
before update on github_installations
for each row execute function set_updated_at();

drop trigger if exists source_files_set_updated_at on source_files;
create trigger source_files_set_updated_at
before update on source_files
for each row execute function set_updated_at();

drop trigger if exists notes_set_updated_at on notes;
create trigger notes_set_updated_at
before update on notes
for each row execute function set_updated_at();

drop trigger if exists assets_set_updated_at on assets;
create trigger assets_set_updated_at
before update on assets
for each row execute function set_updated_at();
