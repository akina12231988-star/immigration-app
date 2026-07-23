-- 配偶者の有無・在日親族（同居）の情報を workers に追加（追加のみ）
alter table workers
  add column if not exists has_spouse text not null default '',          -- 配偶者の有無（'' / 有 / 無）
  add column if not exists relatives_in_japan text not null default '',  -- 在日親族の同居の有無（'' / 有 / 無）
  add column if not exists relatives jsonb not null default '[]'::jsonb; -- 同居親族（氏名・生年月日・勤務先・在留カード番号）
