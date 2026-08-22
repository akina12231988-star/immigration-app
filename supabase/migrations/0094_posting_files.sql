-- 求人に添付するファイル（企業に記載してもらった求人票のPDF・画像など・複数可）。
-- 実体は app-files バケット（posting-files/{posting_id}/...）に保存し、ここにメタデータを持つ。
-- 所属機関の添付（0049_organization_files.sql）と同じ方式。
create table if not exists posting_files (
  id           uuid primary key default gen_random_uuid(),
  posting_id   uuid not null references job_postings(id) on delete cascade,
  kind         text not null default '求人票',
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_posting_files_posting on posting_files (posting_id, created_at);

alter table posting_files enable row level security;

-- 閲覧は全ロール、追加・削除は admin/staff（job_postings と同方針）
drop policy if exists sel_posting_files on posting_files;
create policy sel_posting_files on posting_files for select
  using (my_role() is not null);
drop policy if exists ins_posting_files on posting_files;
create policy ins_posting_files on posting_files for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists del_posting_files on posting_files;
create policy del_posting_files on posting_files for delete
  using (my_role() in ('admin', 'staff'));
