-- 申請準備で「必ず印刷する」書類を印刷した日の記録を追加。
--   roster … 支援責任者・支援担当者の名簿（１－１７号 4.）を印刷した日（YYYY-MM-DD）
-- 何度実行しても安全。
alter table application_prep_checklists
  add column if not exists print_marks jsonb not null default '{}'::jsonb;
comment on column application_prep_checklists.print_marks is
  '必ず印刷する書類を印刷した日（{roster: YYYY-MM-DD}）';
