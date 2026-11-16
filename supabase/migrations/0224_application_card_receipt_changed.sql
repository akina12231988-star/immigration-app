-- 入管申請に、在留カードの受け取りを「郵送」から「窓口」へ変更した日を追加。
-- オンライン申請で郵送受け取りにしていたが、後日、窓口受け取りに変更したときに入れる
-- （申請一覧の「在留カード受け取り待ち」のカードで「窓口受け取りに変更した」を押す。null は変更なし）。
-- 何度実行しても安全（add column if not exists）。
alter table immigration_applications add column if not exists card_receipt_changed_on date;
comment on column immigration_applications.card_receipt_changed_on is '在留カードの受け取りを郵送から窓口へ変更した日（null は変更なし）';

notify pgrst, 'reload schema';
