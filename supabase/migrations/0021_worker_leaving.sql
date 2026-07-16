-- 退職者の記録用に退職日とNotion申請TODO番号を追加（追加のみ）
alter table workers
  add column if not exists leaving_on date,
  add column if not exists leaving_todo text not null default '';
