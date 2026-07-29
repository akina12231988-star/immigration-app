-- 郵送請求の記録に添付するファイル（転出届・住民票の画像など・複数可）。
-- 実体は app-files バケット（mailing-files/{record_id}/...）に保存し、ここにメタデータを持つ。
create table if not exists mailing_files (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references judgment_records(id) on delete cascade,
  kind         text not null default '',
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_mailing_files_record on mailing_files (record_id, created_at);

alter table mailing_files enable row level security;

-- 閲覧は全ロール、追加・削除は admin/staff（judgment_records と同方針）
create policy sel_mailing_files on mailing_files for select
  using (my_role() is not null);
create policy ins_mailing_files on mailing_files for insert
  with check (my_role() in ('admin', 'staff'));
create policy del_mailing_files on mailing_files for delete
  using (my_role() in ('admin', 'staff'));
