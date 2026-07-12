-- docs/03_database_design.md §4.7: 画像・ファイル管理（在留カード表/裏・指定書など）

create table worker_files (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers (id) on delete cascade,
  kind         file_kind not null,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  uploaded_by  uuid references profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index idx_files_worker on worker_files (worker_id, kind);

-- 非公開バケット。閲覧は署名付きURL経由
insert into storage.buckets (id, name, public)
values ('worker-files', 'worker-files', false)
on conflict (id) do nothing;

-- Storage 側の権限: 閲覧は全ロール、追加・差し替え・削除は admin/staff のみ
create policy worker_files_select on storage.objects for select
  using (bucket_id = 'worker-files' and my_role() is not null);
create policy worker_files_insert on storage.objects for insert
  with check (bucket_id = 'worker-files' and my_role() in ('admin', 'staff'));
create policy worker_files_update on storage.objects for update
  using (bucket_id = 'worker-files' and my_role() in ('admin', 'staff'));
create policy worker_files_delete on storage.objects for delete
  using (bucket_id = 'worker-files' and my_role() in ('admin', 'staff'));
