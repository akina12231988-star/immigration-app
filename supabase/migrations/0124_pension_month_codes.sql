-- 年金記録の「月ごとの記号」。
--
-- 申請では「申請月の2か月前まで」の24か月分を見る。記録票は1か月ごとに記号が1文字
-- 並ぶので、月ごとに控えられるようにする（これまでは記号の集合だけで、どの月かが
-- 分からなかった）。
--
--   apply_month … 申請月（"YYYY-MM"）。ここから2か月前までの24か月を確認する
--   months      … 月ごとの記号。{"2024-07": "A", "2024-08": "*"} の形
--
-- symbols（従来のカンマ区切り）はそのまま残す。months を入力すると、そこに出てくる
-- 記号で上書きされる。すべて冪等（何度実行してもエラーにならない）。
alter table pension_records
  add column if not exists apply_month text not null default '',
  add column if not exists months      jsonb not null default '{}'::jsonb;

comment on column pension_records.apply_month is '申請月（YYYY-MM）。2か月前までの24か月分を確認する';
comment on column pension_records.months is '月ごとの記号 {"YYYY-MM": "記号"}';
