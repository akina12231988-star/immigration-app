-- 住所歴の根拠となる画像・PDF（住民票やマイナポータルのスクショなど）を
-- 住所歴の行ごとに保存する（複数可）。
-- 実体は app-files バケット（address-files/{worker_id}/...）に保存し、ここにメタデータを持つ。
-- 添付した日付は created_at で自動で残る。パスポートの添付（0096）と同じ方式。
-- 住所歴の行を消すと添付のメタデータも一緒に消える（on delete cascade）。
create table if not exists worker_address_files (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers(id) on delete cascade,
  address_id   uuid not null references worker_addresses(id) on delete cascade,
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_worker_address_files_worker
  on worker_address_files (worker_id, created_at);
create index if not exists idx_worker_address_files_address
  on worker_address_files (address_id);

alter table worker_address_files enable row level security;

drop policy if exists sel_worker_address_files on worker_address_files;
create policy sel_worker_address_files on worker_address_files for select
  using (my_role() is not null);
drop policy if exists ins_worker_address_files on worker_address_files;
create policy ins_worker_address_files on worker_address_files for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists del_worker_address_files on worker_address_files;
create policy del_worker_address_files on worker_address_files for delete
  using (my_role() in ('admin', 'staff'));
