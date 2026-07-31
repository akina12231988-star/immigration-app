-- 所属機関別の雇用開始日を workers に追加（追加のみ）。
-- 転職すると機関ごとに雇用開始日が異なるため、機関別に記録して
-- 労働者名簿（会社ごと）などで正しい日付を使えるようにする。
alter table workers
  add column if not exists org_employment_starts jsonb not null default '[]'::jsonb; -- [{organization_id, start_on}]
