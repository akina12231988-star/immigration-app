-- 会社からの書類の依頼のチェック表で、会社へ送る書類を「どちらで紐づけるか」をマスごとに決める（0183 の追加）。
--
-- 外国人詳細の「入社時に送る資料」に同じ書類（扶養控除等申告書 など）があっても、
-- 送金額しだいで年末調整用に作り直すことがある。そのとき、どちらを会社へ送るかを選んで残す。
--   'onboarding' … 外国人詳細に添付済みの書類（入社時）を使う
--   'cell'       … このマスに添付した書類（年末調整用に作り直したもの など）を使う
--   null         … 未決定（片方しか無ければそれを使う）
-- 何度実行しても安全（add column if not exists）。
alter table organization_document_request_checks
  add column if not exists use_doc text;
comment on column organization_document_request_checks.use_doc is '会社へ送る書類: onboarding=外国人詳細の書類 / cell=このマスに添付した書類 / null=未決定';

notify pgrst, 'reload schema';
