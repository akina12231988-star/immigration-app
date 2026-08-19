-- 申請番号が二重登録になっている申請を、1件ずつ見比べる（確認だけ・データは変わりません）。
--
-- 同じ申請番号のうち「どちらを残すか」を決めるための表です。
-- 進み具合が先のもの・画像やメモが付いているものを残す想定で、
-- 「残す（おすすめ）」「消す候補」を付けています。
-- 中身を見て問題なければ、この結果を送ってください。削除用のSQLを作ります。
--
-- 「号」の有無・空白・全角半角の違いはそろえて数えます。
with norm as (
  select
    a.*,
    regexp_replace(
      upper(translate(a.application_no,
                      'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ０１２３４５６７８９',
                      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')),
      '[[:space:]　]|号+$', '', 'g'
    ) as no_key
  from immigration_applications a
),
dup as (
  select no_key from norm group by no_key having count(*) > 1
),
detail as (
  select
    n.no_key,
    n.id,
    n.name,
    n.application_date,
    n.status::text as status,
    n.created_at,
    (select count(*) from application_files f where f.application_id = n.id) as files,
    (select count(*) from application_memos m where m.application_id = n.id) as memos,
    (select count(*) from application_extra_requests e where e.application_id = n.id) as extras,
    coalesce(n.granted_card_no, '') as card_no,
    -- 進み具合の順番（先に進んでいるものを残す）
    array_position(
      array['申請前','申請済','LINE報告済','通知書到着','許可済','在留カード受領','取下げ'],
      n.status::text  -- 状態は enum なので文字にそろえてから比べる
    ) as step
  from norm n
  join dup on dup.no_key = n.no_key
),
ranked as (
  select
    d.*,
    row_number() over (
      partition by d.no_key
      order by
        (d.files + d.memos + d.extras) desc,  -- 画像・メモ・追加資料が多いもの
        coalesce(d.step, 0) desc,             -- 進み具合が先のもの
        (case when d.card_no <> '' then 1 else 0 end) desc,
        d.created_at asc                      -- 同じなら先に登録した方
    ) as rn
  from detail d
)
select
  no_key as 申請番号,
  case when rn = 1 then '残す（おすすめ）' else '消す候補' end as 判定,
  name as 氏名,
  application_date as 申請日,
  status as 状態,
  files as 画像,
  memos as メモ,
  extras as 追加資料,
  card_no as 在留カード番号,
  to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as 登録日時,
  id as 申請ID
from ranked
order by 申請番号, rn;
