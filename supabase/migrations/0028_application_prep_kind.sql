-- 申請準備の区分（追加のみ）
-- '' = 更新（在留期限の3か月前から自動で対象になる従来の流れ）
-- '新規' = 新規で申請書類準備（申請準備ページから手動で追加した人）
alter table workers
  add column if not exists application_prep_kind text not null default '';
