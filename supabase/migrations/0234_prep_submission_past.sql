-- 申請準備の提出書類一覧表の「過去に提出した申請情報」（申請年月日・受付番号）。
-- 過去1年以内の申請で出した書類（納税証明書・課税証明書・源泉徴収票など）を省略するとき、
-- 入管の様式のその欄に書き込む。キーは書類（例: t1-9）、値は {"on": "YYYY-MM-DD", "no": "受付番号"}。
-- 何度実行しても安全。
alter table application_prep_checklists
  add column if not exists submission_past jsonb not null default '{}'::jsonb;
comment on column application_prep_checklists.submission_past is
  '提出書類一覧表の過去に提出した申請情報（{書類のキー: {on, no}}）';

notify pgrst, 'reload schema';
