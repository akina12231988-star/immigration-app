-- 一覧表印刷用の項目を workers に追加（追加のみ）
alter table workers
  add column if not exists gender text not null default '',              -- 性別
  add column if not exists employment_start_on date,                     -- 雇用開始年月日
  add column if not exists assigned_office text not null default '',     -- 配属先営業所
  add column if not exists residence_note text not null default '';      -- 居住先（社宅・自分のアパート など）
