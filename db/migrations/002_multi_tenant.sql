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

alter table sites
  add column if not exists user_id text references users(id) on delete cascade;

create index if not exists sites_user_id_idx
  on sites(user_id);

create index if not exists github_installations_user_id_idx
  on github_installations(user_id);

alter table ingest_runs
  drop constraint if exists ingest_runs_trigger_check;

alter table ingest_runs
  add constraint ingest_runs_trigger_check
  check (trigger in ('agent_api', 'github_action', 'admin_full_sync', 'manual'));

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

drop trigger if exists github_installations_set_updated_at on github_installations;
create trigger github_installations_set_updated_at
before update on github_installations
for each row execute function set_updated_at();
