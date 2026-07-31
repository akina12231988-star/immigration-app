-- 特定技能2号の合格試験名を workers に追加（追加のみ）。
-- 入力があれば「特定技能2号 合格」として扱い、合格証は
-- onboarding_documents（doc_key='cert_ssw2'）に保存する。
alter table workers
  add column if not exists ssw2_exam text not null default ''; -- 特定技能2号の合格試験名
