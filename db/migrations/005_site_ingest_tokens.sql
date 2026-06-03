alter table sites
  add column if not exists ingest_token_hash text;

alter table sites
  add column if not exists ingest_token_ciphertext text;

alter table sites
  add column if not exists ingest_token_last_four text;

alter table sites
  add column if not exists ingest_token_created_at timestamptz;
