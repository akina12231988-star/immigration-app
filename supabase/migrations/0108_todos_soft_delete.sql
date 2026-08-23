-- TODOの削除フォルダ（ごみ箱）。
-- 削除するとすぐ消さずに deleted_at を入れて30日間保存し、
-- 30日を過ぎたものは画面を開いたときに完全に削除される。
-- 冪等（何度実行してもエラーにならない）。
alter table todos
  add column if not exists deleted_at timestamptz; -- 削除フォルダに入れた日時（null = 通常のTODO）
