-- 申請準備チェックリストの申請種別に「特定活動」（特定活動へ資格変更申請）を追加。
-- 必要書類は在留カード・顔写真・パスポート・専門級/日本語/専門外の合格証。
alter table application_prep_checklists
  drop constraint if exists application_prep_checklists_app_type_check;
alter table application_prep_checklists
  add constraint application_prep_checklists_app_type_check
  check (app_type in ('', '変更', '更新', '認定', '特定活動'));
