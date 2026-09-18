-- 申請準備の課税証明書・納税証明書（市県民税）で、対象年度と違う年度の書類で対応するときの
-- 「使う年度」（令和年）。別の年度の証明書がすでに添付されているとき、どちらの年度で
-- 対応するかを書類ごと・準備リストごとに選べるようにする。null なら対象年度のまま。
-- 何度実行しても安全（if not exists）
alter table prep_doc_statuses
  add column if not exists use_reiwa integer;

comment on column prep_doc_statuses.use_reiwa is
  '課税・納税証明書で対応する年度（令和年）。null は準備リストの対象年度';
