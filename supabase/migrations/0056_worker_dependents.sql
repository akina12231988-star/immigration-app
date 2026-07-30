-- 扶養家族（扶養親族証明書の内容）を workers に追加（追加のみ）。
-- 扶養控除等申告書の作成と、控除区分（配偶者控除・老人扶養親族など）の自動判定に使う。
alter table workers
  add column if not exists dependents jsonb not null default '[]'::jsonb; -- 扶養家族 [{name, kana, relation, birth, address, occupation, my_number, income}]
