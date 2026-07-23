-- 申請準備チェックリストを Notion申請TODO番号ごとに複数持てるようにする。
-- 主キーを worker_id 単独から id に変更し、(worker_id, todo_no) の組で一意にする。
-- 既存行は todo_no='' のまま残り、「（番号未設定）」のリストとしてそのまま使える。
alter table application_prep_checklists
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists todo_no text not null default '';
alter table application_prep_checklists
  drop constraint if exists application_prep_checklists_pkey;
alter table application_prep_checklists add primary key (id);
create unique index if not exists application_prep_checklists_worker_todo
  on application_prep_checklists (worker_id, todo_no);

-- リストの削除（admin/staff のみ）。既存ポリシーには delete が無かったため追加
drop policy if exists del_prep_checklist on application_prep_checklists;
create policy del_prep_checklist on application_prep_checklists for delete
  using (my_role() in ('admin', 'staff'));
