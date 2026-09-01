-- パスポートの発行年月日（DATE OF ISSUE）を記録できるようにする（追加のみ）
alter table workers
  add column if not exists passport_issue_date date;

comment on column public.workers.passport_issue_date is
  'パスポートの発行年月日（DATE OF ISSUE）';
