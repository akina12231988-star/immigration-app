-- 申請準備に、「特定技能1号」に係る提出書類一覧表（在留資格変更許可申請用）の提出確認欄（有／無）を追加。
-- キーは書類（例: t1-4-1 = 第1表 4(1)、t3a-1-1 = 第3表の13の1 1①）、値は '有' か '無'。
-- 選んでいない書類は入れない（画面では申請準備の情報から見当を付けて出す）。
-- 何度実行しても安全。
alter table application_prep_checklists
  add column if not exists submission_marks jsonb not null default '{}'::jsonb;
comment on column application_prep_checklists.submission_marks is
  '提出書類一覧表の提出確認欄（{書類のキー: 有/無}）';

notify pgrst, 'reload schema';
