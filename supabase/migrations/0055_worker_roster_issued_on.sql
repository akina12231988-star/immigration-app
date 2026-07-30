-- 労働者名簿に発行年月日を追加（追加のみ）。
-- 労働基準法第107条（記載事項）・第109条（5年間保存）に基づき、
-- 発行年月日から保存期間（発行から5年）を管理する。
alter table worker_rosters
  add column if not exists issued_on date; -- 発行年月日
