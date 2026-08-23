-- 申請準備 書類チェックリストの追加項目。
--  - 単独申請か連名申請か（連名の場合は、どの外国人のTODO番号と連名かの紐づけ）
--  - 本人から署名をもらったかどうかのステータス
-- すべて冪等（何度実行してもエラーにならない）。
alter table application_prep_checklists
  add column if not exists joint_kind text not null default '';        -- '' / 単独 / 連名
alter table application_prep_checklists
  add column if not exists joint_worker_id uuid references workers (id) on delete set null; -- 連名相手の外国人
alter table application_prep_checklists
  add column if not exists joint_todo_no text not null default '';     -- 連名相手のTODO番号
alter table application_prep_checklists
  add column if not exists sign_status text not null default '';       -- 本人から署名をもらったかのステータス
