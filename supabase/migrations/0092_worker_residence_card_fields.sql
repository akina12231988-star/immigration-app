-- 在留カードの券面から入力できるようにするための列。
--
-- 在留カードには「在留期間」（1年・3年 など）が書かれているが、workers には
-- これを入れる場所が無く、カードから入力しても捨てるしかなかった。
-- 在留期間は満了日（residence_expiry_date）とは別物で、
-- 更新のたびに何年もらえたかが分かる。
--
-- 何度実行しても安全です（if not exists）。
alter table workers
  add column if not exists residence_period text not null default '';

comment on column workers.residence_period is
  '在留カードの在留期間（例: 1年・3年・6月）。満了日は residence_expiry_date。空欄 = 未入力';
