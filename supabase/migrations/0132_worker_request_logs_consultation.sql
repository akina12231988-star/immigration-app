-- 対応の記録（0131）を、参考様式第５－４号「相談記録書」の1行としてそのまま出せる形にする。
-- 様式は「機関ごと・期間ごと」に、1行＝1件の相談（相談受理日・相談者・相談内容・
-- 対応結果・対応者の氏名）を並べるため、記録1件の中に相談内容と対応結果を持たせる。
-- すべて冪等（何度実行してもエラーにならない）。
alter table worker_request_logs
  -- 記録した時点の所属機関。あとで転職しても過去の記録は元の機関に残す
  add column if not exists organization_id uuid references organizations (id) on delete set null,
  -- 対応結果（あとから追記できるように空を許す）
  add column if not exists result text not null default '',
  -- 対応者の氏名（様式の必須列。既定はログイン中の担当者名）
  add column if not exists handler_name text not null default '',
  -- 相談記録書に載せるかどうか（社内メモだけの記録は外せる）
  add column if not exists is_consultation boolean not null default true;

comment on column public.worker_request_logs.organization_id is
  '記録した時点の所属機関（相談記録書はこの機関で集計する）';
comment on column public.worker_request_logs.result is '対応結果（参考様式第５－４号）';
comment on column public.worker_request_logs.handler_name is '対応者の氏名（参考様式第５－４号）';
comment on column public.worker_request_logs.is_consultation is '相談記録書に載せるか';

-- 機関ごと・期間ごとに引くための索引
create index if not exists idx_worker_request_logs_org
  on worker_request_logs (organization_id, logged_on);

-- 既存の記録に所属機関を補完する（今の所属機関で埋める）
update worker_request_logs l
   set organization_id = w.current_organization_id
  from workers w
 where w.id = l.worker_id
   and l.organization_id is null
   and w.current_organization_id is not null;

-- 0131 の「対応したこと」の記録は、内容が対応結果にあたるので相談記録書には載せない。
-- （必要なら画面の「相談記録書に載せる」で戻せる。画面で直した記録は
--  対応結果か対応者が入るので、もう一度実行しても戻らない）
update worker_request_logs
   set is_consultation = false
 where kind = '対応したこと'
   and is_consultation
   and result = ''
   and handler_name = '';
