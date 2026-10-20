-- 会社からの書類の依頼（0183）で、外国人 × 書類のマスにファイルを添付できるようにする。
-- 本人から受け取った書類（扶養控除申告書の写しなど）をそのままマスに落として保管し、
-- 会社へ送るときに取り出せるようにする。実体は非公開バケット app-files
-- （doc-request-files/{request_id}/{worker_id}/...）に保存し、この表はメタデータだけ持つ。
-- 何度実行しても同じ結果になる。
create table if not exists organization_document_request_files (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references organization_document_requests (id) on delete cascade,
  worker_id    uuid not null references workers (id) on delete cascade,
  item_id      text not null,                      -- 依頼の items の id
  storage_path text not null,                      -- app-files バケット内のパス
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_organization_document_request_files_request
  on organization_document_request_files (request_id, worker_id, item_id);

alter table organization_document_request_files enable row level security;

-- 閲覧は全ロール、追加・削除は admin/staff（organization_files と同じ方針）
drop policy if exists sel_organization_document_request_files on organization_document_request_files;
create policy sel_organization_document_request_files on organization_document_request_files for select
  using (my_role() is not null);
drop policy if exists ins_organization_document_request_files on organization_document_request_files;
create policy ins_organization_document_request_files on organization_document_request_files for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists del_organization_document_request_files on organization_document_request_files;
create policy del_organization_document_request_files on organization_document_request_files for delete
  using (my_role() in ('admin', 'staff'));
