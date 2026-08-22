-- パスポートのMRZ（下2行）を外国人ごとに保存する。
-- 読み取って反映したときに一緒に保存し、外国人詳細のパスポート枠で
-- いつでも項目ごとにコピーできるようにする（プロメトリック申込の転記用）。
-- 表示時に毎回この2行を解析するので、読み取り結果の各項目は別に持たない。

alter table public.workers
  add column if not exists passport_mrz text not null default '';

comment on column public.workers.passport_mrz is
  'パスポートMRZの2行（TD3・改行区切り。読み取り反映時に保存。0095）';
