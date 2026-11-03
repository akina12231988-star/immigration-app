-- 個人票（A4印刷）の備考。
--
-- 個人票の退職日の横に出す自由記入の欄（2号へ移行した、転籍した など）。
-- 個人票の「情報を訂正」からその場で書き込める。
-- 過去の在籍期間の個人票の備考は worker_period_cards.note（0136）を使うので、
-- この列は「現在の内容」の個人票にだけ使う。
-- 何度実行しても安全（if not exists）
alter table workers
  add column if not exists print_note text not null default '';

comment on column workers.print_note is
  '個人票の備考（退職日の横に出す自由記入の欄）';
