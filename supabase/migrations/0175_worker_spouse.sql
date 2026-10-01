-- 配偶者の情報（外国人詳細の「家族情報」）。
--
-- 配偶者の有無が「有」のときに記録する。
-- 日本に住んでいる配偶者がこのシステムに外国人として登録されていれば worker_id でリンクし、
-- 登録が無ければ 氏名・生年月日・同居の有無・在留カード番号・勤務先 を直接記録する。
--
-- 何度流しても大丈夫（if not exists）。
alter table workers
  add column if not exists spouse jsonb not null default '{}'::jsonb;

comment on column workers.spouse is
  '配偶者の情報（worker_id でシステム内の外国人とリンク、または氏名・生年月日・同居の有無・在留カード番号・勤務先）';
