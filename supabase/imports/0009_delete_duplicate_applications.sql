-- 申請番号が二重登録になっている申請を1件にまとめる。
--
-- 残すのは「外国人詳細に紐づけてある方（外国人が入っている方）」。
-- 両方に入っている（または両方とも入っていない）ときは、
--   画像・メモ・追加資料が多い → 進み具合が先 → 在留カード番号あり → 先に登録した方
-- の順で残す方を決めます。
--
-- 消す前に、消す側に付いている画像・メモ・追加資料・生活オリエンテーション・売上を
-- 残す側へ付け替えるので、記録は失われません。
--
-- 何度実行しても安全です（二重登録が無くなれば何も起きません）。
-- 「Run without RLS」で実行してください。

-- 1) 残す方・消す方を決める
drop table if exists dup_plan;
create temp table dup_plan as
with norm as (
  select
    a.id, a.name, a.worker_id, a.application_date, a.status::text as status,
    a.granted_card_no, a.created_at,
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
ranked as (
  select
    n.*,
    (select count(*) from application_files f where f.application_id = n.id)
      + (select count(*) from application_memos m where m.application_id = n.id)
      + (select count(*) from application_extra_requests e where e.application_id = n.id) as attached,
    row_number() over (
      partition by n.no_key
      order by
        (case when n.worker_id is not null then 1 else 0 end) desc, -- 外国人に紐づけてある方
        ((select count(*) from application_files f where f.application_id = n.id)
         + (select count(*) from application_memos m where m.application_id = n.id)
         + (select count(*) from application_extra_requests e where e.application_id = n.id)) desc,
        coalesce(array_position(
          array['申請前','申請済','LINE報告済','通知書到着','許可済','在留カード受領','取下げ'],
          n.status), 0) desc,
        (case when coalesce(n.granted_card_no, '') <> '' then 1 else 0 end) desc,
        n.created_at asc
    ) as rn
  from norm n
  join dup on dup.no_key = n.no_key
)
select
  r.no_key,
  r.id,
  r.name,
  r.status,
  r.worker_id is not null as linked,
  r.attached,
  r.rn,
  first_value(r.id) over (partition by r.no_key order by r.rn) as keep_id
from ranked r;

-- 2) 消す側に付いている記録を、残す側へ付け替える
update application_files f set application_id = p.keep_id
from dup_plan p where f.application_id = p.id and p.rn > 1;

update application_memos m set application_id = p.keep_id
from dup_plan p where m.application_id = p.id and p.rn > 1;

update application_extra_requests e set application_id = p.keep_id
from dup_plan p where e.application_id = p.id and p.rn > 1;

update orientations o set application_id = p.keep_id
from dup_plan p where o.application_id = p.id and p.rn > 1;

update sales_entries s set matched_application_id = p.keep_id
from dup_plan p where s.matched_application_id = p.id and p.rn > 1;

-- 3) 二重登録の方を消す
delete from immigration_applications a
using dup_plan p
where a.id = p.id and p.rn > 1;

-- 4) 結果（この表を送ってください）
select
  p.no_key as 申請番号,
  p.name as 氏名,
  case when p.rn = 1 then '残した' else '消した' end as 処理,
  p.status as 状態,
  case when p.linked then '外国人に紐づけあり' else '紐づけなし' end as 外国人,
  p.attached as 画像メモ等,
  p.id as 申請ID
from dup_plan p
order by p.no_key, p.rn;
