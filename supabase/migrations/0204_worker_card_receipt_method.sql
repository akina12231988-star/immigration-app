-- 在留カードの受領方法（オンライン申請の「受領方法等」）。
--
-- 申請準備の「申請書に貼る情報をコピー ＞ オンライン申請の順 ＞ 受領方法等・フリー欄」で、
-- 在留カードの受領方法（郵送／窓口）をその場で選んで保存する。
-- 「窓口」のときは受領官署に「福岡出入国在留管理局 熊本出張所」を出す。
-- 何度実行しても安全（if not exists）
alter table workers
  add column if not exists card_receipt_method text not null default '';

comment on column workers.card_receipt_method is
  '在留カードの受領方法（オンライン申請の受領方法等。空 / 郵送 / 窓口）';
