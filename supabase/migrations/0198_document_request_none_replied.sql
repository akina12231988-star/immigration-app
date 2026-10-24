-- 会社からの書類の依頼のチェック表に「本人から無いと回答あり」を足す（0183 の追加）。
--
-- 案内したあと、本人から「その書類は持っていない」と返事があったとき、その日を記録する。
-- 発行・会社へ を押す（あとで手に入った・会社に伝えた）と自動で外れる。
-- 何度実行しても安全（add column if not exists）。
alter table organization_document_request_checks
  add column if not exists none_replied_on date;
comment on column organization_document_request_checks.none_replied_on is '本人から「無い」と回答があった日（案内のあと）';
