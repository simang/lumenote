alter table share_links
  add column if not exists token_ciphertext text;

alter table share_links
  add column if not exists updated_at timestamptz not null default now();

create index if not exists share_links_site_id_idx
  on share_links(site_id);

create index if not exists share_links_note_id_idx
  on share_links(note_id);

drop trigger if exists share_links_set_updated_at on share_links;
create trigger share_links_set_updated_at
before update on share_links
for each row execute function set_updated_at();
