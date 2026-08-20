-- 基本情報の住所と住所歴の最新が食い違っている人の、住所を全文で見比べる（確認だけ）。
--
-- 0011_check_address_mismatch.sql で1件（HOANG MINH TUNG）出たため、
-- どちらが正しいかを判断できるよう、両方の住所を全文と長さつきで出す。
-- 「どこから違うか」の位置も出すので、番地の書き方の違い（ハイフン・丁目など）か、
-- 引越しによる本当の住所変更かを見分けられる。
--
-- 何度実行しても安全です（select だけ）。
with latest as (
  select distinct on (worker_id)
         worker_id, moved_on, address, created_at
  from worker_addresses
  order by worker_id, moved_on desc, created_at desc
)
select
  w.name                                as 氏名,
  w.status::text                        as 在籍状況,
  w.address                             as 基本情報の住所,
  length(w.address)                     as 基本情報の文字数,
  l.address                             as 住所歴の最新,
  length(l.address)                     as 住所歴の文字数,
  l.moved_on                            as 転入日,
  -- 先頭から何文字目まで同じか（そこから後ろが違うところ）
  (
    select count(*)
    from generate_series(1, least(length(w.address), length(l.address))) as i
    where substr(w.address, 1, i) = substr(l.address, 1, i)
  )                                     as 同じ文字数,
  -- 違い始めるところから後ろだけを並べて見る
  substr(w.address, (
    select count(*)
    from generate_series(1, least(length(w.address), length(l.address))) as i
    where substr(w.address, 1, i) = substr(l.address, 1, i)
  ) + 1)                                as 基本情報の違う部分,
  substr(l.address, (
    select count(*)
    from generate_series(1, least(length(w.address), length(l.address))) as i
    where substr(w.address, 1, i) = substr(l.address, 1, i)
  ) + 1)                                as 住所歴の違う部分
from workers w
join latest l on l.worker_id = w.id
where coalesce(w.address, '') <> l.address
order by w.name;
