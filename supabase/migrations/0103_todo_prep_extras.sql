-- 申請準備のTODOの追加機能。
--   ・あっせんの有無（無しの場合は申請書類作成の経緯を記入。有りの場合は求人への採用の流れを表示）
--   ・チェック後の「申請書類の訂正記録」（訂正書類名・訂正箇所の画像・訂正内容を複数保存）
-- 何度実行しても安全（if not exists）

alter table todos
  add column if not exists assen text not null default ''
  check (assen in ('', 'あり', 'なし'));
alter table todos
  add column if not exists assen_note text not null default '';

comment on column todos.assen is 'あっせんの有無（あり / なし。空 = 未設定）';
comment on column todos.assen_note is 'あっせん無しの場合の、どのような経緯での申請書類作成かの記入';

-- 申請書類の訂正記録（チェック後）。画像は app-files バケット（todo-corrections/{todo_id}/…）
create table if not exists todo_corrections (
  id           uuid primary key default gen_random_uuid(),
  todo_id      uuid not null references todos(id) on delete cascade,
  doc_name     text not null default '',  -- 訂正書類名
  content      text not null default '',  -- 訂正内容
  storage_path text not null default '',  -- 訂正箇所の画像（無しでも記録できる）
  file_name    text not null default '',
  mime_type    text not null default '',
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_todo_corrections_todo on todo_corrections (todo_id, created_at);

alter table todo_corrections enable row level security;

drop policy if exists sel_todo_corrections on todo_corrections;
create policy sel_todo_corrections on todo_corrections for select using (my_role() is not null);
drop policy if exists ins_todo_corrections on todo_corrections;
create policy ins_todo_corrections on todo_corrections for insert with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_todo_corrections on todo_corrections;
create policy upd_todo_corrections on todo_corrections for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_todo_corrections on todo_corrections;
create policy del_todo_corrections on todo_corrections for delete using (my_role() in ('admin', 'staff'));
