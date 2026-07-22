-- 帰国期間（本国での職歴・その他）の職歴に、在留資格を保持したまま帰国したかを記録する。
-- 特定技能1号を保持したまま帰国していた期間は通算5年にカウントし、
-- 在留資格を切って帰国した期間はカウントしない（既存データは「切って帰国」= false）。
alter table work_histories
  add column if not exists kept_residence_status boolean not null default false;
