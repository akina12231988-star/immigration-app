-- 試験の申込のTODOの詳細（希望する受験内容・申込日・試験日・アプリケーションNo.・
-- プロメトリックIDなど）を todos.exam（jsonb）に保存する。
-- 発行されたアプリケーションNo.のPDF・画像は todo_files に添付する（求人の添付 0094 と同じ方式）。

alter table todos add column if not exists exam jsonb not null default '{}';

create table if not exists todo_files (
  id           uuid primary key default gen_random_uuid(),
  todo_id      uuid not null references todos(id) on delete cascade,
  kind         text not null default 'アプリケーションNo.',
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_todo_files_todo on todo_files (todo_id, created_at);

alter table todo_files enable row level security;

-- 閲覧は全ロール、追加・削除は admin/staff（todos と同方針）
drop policy if exists sel_todo_files on todo_files;
create policy sel_todo_files on todo_files for select
  using (my_role() is not null);
drop policy if exists ins_todo_files on todo_files;
create policy ins_todo_files on todo_files for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists del_todo_files on todo_files;
create policy del_todo_files on todo_files for delete
  using (my_role() in ('admin', 'staff'));
