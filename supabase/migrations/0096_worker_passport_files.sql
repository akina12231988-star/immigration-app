-- パスポートのスタンプページなどのPDF・画像を外国人ごとに保存する（複数可）。
-- 実体は app-files バケット（passport-files/{worker_id}/...）に保存し、ここにメタデータを持つ。
-- 添付した日付は created_at で自動で残る。求人の添付（0094_posting_files.sql）と同じ方式。
create table if not exists worker_passport_files (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers(id) on delete cascade,
  kind         text not null default 'スタンプページ',
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_worker_passport_files_worker
  on worker_passport_files (worker_id, created_at);

alter table worker_passport_files enable row level security;

drop policy if exists sel_worker_passport_files on worker_passport_files;
create policy sel_worker_passport_files on worker_passport_files for select
  using (my_role() is not null);
drop policy if exists ins_worker_passport_files on worker_passport_files;
create policy ins_worker_passport_files on worker_passport_files for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists del_worker_passport_files on worker_passport_files;
create policy del_worker_passport_files on worker_passport_files for delete
  using (my_role() in ('admin', 'staff'));
