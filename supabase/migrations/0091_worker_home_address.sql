-- 外国人に「母国の住所」を持たせる。
--
-- workers.address は日本での住所（労働者名簿・履歴書・扶養控除等申告書に使う）で、
-- 母国の住所を書く場所が無かった。在留資格の申請書類や、帰国後の連絡先として
-- 必要になるため、別の列で持つ。
--
-- 何度実行しても安全です（if not exists）。
alter table workers
  add column if not exists home_address text not null default '';

comment on column workers.home_address is
  '母国の住所（本国の住所）。日本での住所は workers.address。空欄 = 未入力';
