alter table ingest_runs
  drop constraint if exists ingest_runs_trigger_check;

update ingest_runs
set trigger = 'dashboard_full_sync'
where trigger = 'admin_full_sync';

alter table ingest_runs
  add constraint ingest_runs_trigger_check
  check (trigger in ('agent_api', 'github_action', 'dashboard_full_sync', 'admin_full_sync', 'manual'));
