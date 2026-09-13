-- 登録支援機関（当社）に添付するファイル。
-- まずは職業紹介事業者として人材サービス総合サイトに掲載している画面の画像（kind = '人材サービス総合サイト'）。
-- 実体は app-files バケット（support-org-files/...）に保存し、ここにメタデータを持つ。
-- 最新版（いちばん新しいアップロード日の分）を登録支援機関の画面に表示する。
create table if not exists support_org_files (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default '人材サービス総合サイト',
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_support_org_files_kind on support_org_files (kind, created_at);

alter table support_org_files enable row level security;

-- 閲覧はログイン者全員、追加・削除は admin/staff（organization_files と同方針）
drop policy if exists sel_support_org_files on support_org_files;
drop policy if exists ins_support_org_files on support_org_files;
drop policy if exists del_support_org_files on support_org_files;
create policy sel_support_org_files on support_org_files for select
  using (my_role() is not null);
create policy ins_support_org_files on support_org_files for insert
  with check (my_role() in ('admin', 'staff'));
create policy del_support_org_files on support_org_files for delete
  using (my_role() in ('admin', 'staff'));
