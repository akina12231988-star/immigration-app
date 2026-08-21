-- 在留カードの券面から入力できるようにするための2列。
--
-- 在留カードには「在留期間」（1年・3年 など）と「就労制限の有無」が書かれているが、
-- workers にはこれを入れる場所が無く、カードから入力しても捨てるしかなかった。
--
-- 在留期間は満了日（residence_expiry_date）とは別物で、更新のたびに何年もらえたかが分かる。
-- 就労制限は「就労不可 / 在留資格に基づく就労活動のみ可 /
-- 指定書により指定された就労活動のみ可 / 就労制限なし」の4種類。
--
-- 何度実行しても安全です（if not exists）。
alter table workers
  add column if not exists residence_period text not null default '',
  add column if not exists work_restriction text not null default '';

comment on column workers.residence_period is
  '在留カードの在留期間（例: 1年・3年・6月）。満了日は residence_expiry_date。空欄 = 未入力';
comment on column workers.work_restriction is
  '在留カードの就労制限の有無（就労不可 / 在留資格に基づく就労活動のみ可 / 指定書により指定された就労活動のみ可 / 就労制限なし）。空欄 = 未入力';
