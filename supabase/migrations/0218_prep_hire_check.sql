-- 申請準備に、所属機関への採用条件の確認（LINEグループで時給・居住費用を聞く）の記録を追加。
--   housing        … 社宅 / 自分で契約（VUONG VAN THANH に聞いた結果）
--   housing_on     … 聞いた日
--   message_copied_on … 所属機関への文章をコピーした日
--   resume_path / resume_name … 履歴書の画像（app-files バケットの prep-resumes/）
-- 何度実行しても安全。
alter table application_prep_checklists
  add column if not exists hire_check jsonb not null default '{}'::jsonb;
comment on column application_prep_checklists.hire_check is
  '所属機関への採用条件の確認（{housing, housing_on, message_copied_on, resume_path, resume_name}）';
