-- 過去の定期売上No.（転職前の所属機関で使っていた番号）を workers に追加（追加のみ）。
--
-- 定期売上No.は所属機関ごとに発行するため、転職すると新しい番号になる。
-- 旧番号は旧所属機関と紐付けて残し（退職済み・もう請求には使わない）、
-- 現在の番号（workers.recurring_sales_no）を現在の所属機関の在籍中の番号として使う。
alter table workers
  add column if not exists past_recurring_sales jsonb not null default '[]'::jsonb; -- [{organization_id, sales_no}]
