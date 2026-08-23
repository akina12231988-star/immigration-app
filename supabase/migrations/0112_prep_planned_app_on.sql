-- 申請予定日（準備リストごと）。健康診断書が申請予定日に対して使用できるか
-- （受診日から1年後まで有効）のチェックに使う。
alter table application_prep_checklists
  add column if not exists planned_app_on date;
