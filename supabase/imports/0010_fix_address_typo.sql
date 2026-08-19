-- 住所の「勇払郡」が「男払郡」と入力されている外国人を直す。
--
-- ANHAR さんの労働者名簿で住所が「北海道男払郡…」となっていました。
-- 名簿は外国人詳細の住所をそのまま表示するため、元データの誤字とみられます。
-- 同じ誤字が入っている人をまとめて確認し、「勇払郡」に直します。
-- 住所歴（worker_addresses）に同じ誤字があればあわせて直します。
--
-- 何度実行しても安全です。「Run without RLS」で実行してください。

-- 直す
update workers
set address = replace(address, '男払郡', '勇払郡')
where address like '%男払郡%';

update worker_addresses
set address = replace(address, '男払郡', '勇払郡')
where address like '%男払郡%';

-- 結果（直したあとの確認。該当者の現在の住所が出ます）
select name as 氏名, address as 住所
from workers
where address like '%勇払郡%'
order by name;
