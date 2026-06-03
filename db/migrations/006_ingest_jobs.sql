create table if not exists ingest_jobs (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  kind text not null check (kind in ('full_sync')),
  ref text,
  trigger text not null check (trigger in ('dashboard_full_sync', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  ingest_run_id text references ingest_runs(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  error text,
  requested_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists ingest_jobs_one_active_full_sync_per_site_idx
  on ingest_jobs(site_id)
  where kind = 'full_sync' and status in ('queued', 'running');

create index if not exists ingest_jobs_site_id_created_at_idx
  on ingest_jobs(site_id, created_at desc);

create index if not exists ingest_jobs_status_created_at_idx
  on ingest_jobs(status, created_at);

drop trigger if exists ingest_jobs_set_updated_at on ingest_jobs;
create trigger ingest_jobs_set_updated_at
before update on ingest_jobs
for each row execute function set_updated_at();
