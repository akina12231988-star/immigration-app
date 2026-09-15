-- 前回の申請（申請日・申請番号）の手入力欄。
--
-- 課税証明書・納税証明書（市県民税／国保税）・源泉徴収票・保険証・年金記録は、
-- 1年以内に別の申請で提出していれば、その申請日と申請番号を書けば再提出が省ける。
-- ふつうは申請一覧（immigration_applications）から自動で拾うが、
-- このアプリに登録する前の申請などデータが無いときは、ここに手で入れて
-- 外国人詳細と申請準備に表示する。何度実行しても安全（if not exists）
alter table workers
  add column if not exists prior_application_on date,
  add column if not exists prior_application_no text not null default '';

comment on column workers.prior_application_on is
  '前回の申請日（手入力。申請一覧に1年以内の申請があるときはそちらを優先して表示）';
comment on column workers.prior_application_no is
  '前回の申請番号（手入力。申請一覧に1年以内の申請があるときはそちらを優先して表示）';
