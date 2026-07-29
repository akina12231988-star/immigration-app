-- 所属機関に添付するファイル（見積書など・複数可）。
-- 実体は app-files バケット（org-files/{organization_id}/...）に保存し、ここにメタデータを持つ。
create table if not exists organization_files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            text not null default '見積書',
  storage_path    text not null,
  file_name       text not null default '',
  mime_type       text not null default '',
  uploaded_by     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_organization_files_org on organization_files (organization_id, created_at);

alter table organization_files enable row level security;

-- 閲覧は全ロール、追加・削除は admin/staff（organizations と同方針）
create policy sel_organization_files on organization_files for select
  using (my_role() is not null);
create policy ins_organization_files on organization_files for insert
  with check (my_role() in ('admin', 'staff'));
create policy del_organization_files on organization_files for delete
  using (my_role() in ('admin', 'staff'));
