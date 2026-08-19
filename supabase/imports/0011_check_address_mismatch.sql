-- 「基本情報の住所」と「住所歴の最新」が食い違っている外国人を全員分洗い出す
-- （確認だけ・データは変わりません）。
--
-- 労働者名簿・履歴書・扶養控除等申告書は基本情報の住所で作られます。
-- 住所歴は課税・納税証明書の「1月1日時点の住所」判定に使われます。
-- 両方が食い違っていると、書類によって住所が変わってしまうため、ここでそろえます。
--
-- 結果を送ってください。多い場合はまとめて直すSQLを作ります。
-- 1〜2人なら、外国人詳細の住所歴に出る黄色の注意書きのボタンでも直せます。
with latest as (
  select distinct on (worker_id)
         worker_id, moved_on, address
  from worker_addresses
  order by worker_id, moved_on desc, created_at desc
)
select
  w.name as 氏名,
  w.status::text as 在籍状況,
  w.address as 基本情報の住所,
  l.address as 住所歴の最新,
  l.moved_on as 転入日
from workers w
join latest l on l.worker_id = w.id
where coalesce(w.address, '') <> l.address
order by w.name;
