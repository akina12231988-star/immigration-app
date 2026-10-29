-- １－１７号（特定技能外国人支援計画書）の「6. 住居」の選択。
--
-- 申請準備の詳細画面で A（外国人が自分で契約する住居）・B（社宅・自己所有物件）・
-- C（社宅・賃貸物件）のどれにするかと、それができなかったときに対応予定の候補を選んで保存する。
-- 形: {"main": "A"|"B"|"C", "fallback": "A"|"B"|"C"|""}（空の {} は未選択。1-6号別紙の居住費からの候補を出す）
-- 何度実行しても安全（if not exists）
alter table workers
  add column if not exists housing_plan jsonb not null default '{}'::jsonb;

comment on column workers.housing_plan is
  '１－１７号の「6. 住居」の選択（main: A/B/C、fallback: できなかったときに対応予定の候補）';
