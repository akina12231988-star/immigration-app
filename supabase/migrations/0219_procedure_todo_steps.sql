-- 住所・保険の手続きのTODOを、1人につき1件にまとめる。
-- 0217 では手続きごと（転出・転入・国保・国民年金）に別のTODOにしていたが、同じ人は同じTODOで扱う。
-- TODOの中に手続きごとの経過・依頼先・依頼日・メモを持つ（procedure_steps）。
--   { "moveOut": {status, requested_to, requested_on, note}, "moveIn": {...}, "kokuho": {...}, "nenkin": {...} }
-- TODOの経過は、中の手続きから決める（残りがあれば未着手／依頼中、全部終われば完了）。
-- 何度実行しても安全。

alter table todos add column if not exists procedure_steps jsonb not null default '{}'::jsonb;
comment on column todos.procedure_steps is '住所・保険の手続きのTODOの中の手続き（転出・転入・国保・国民年金）ごとの経過・依頼先・依頼日・メモ';

-- 0217 で手続きごとに作ったTODOを、外国人ごとに1件にまとめる（いちばん古いTODOの番号を残す）
with p as (
  select id, worker_id, status, requested_to, requested_on, note, created_at,
    case title
      when '転出手続き' then 'moveOut'
      when '転入手続き' then 'moveIn'
      when '国民健康保険の加入手続き' then 'kokuho'
      when '国民年金の加入手続き' then 'nenkin'
    end as k
  from todos
  where kind = '住所・保険の手続き' and deleted_at is null and worker_id is not null
    and title in ('転出手続き', '転入手続き', '国民健康保険の加入手続き', '国民年金の加入手続き')
),
keep as (
  select distinct on (worker_id) worker_id, id from p order by worker_id, created_at asc
),
latest as (
  select distinct on (worker_id, k) * from p order by worker_id, k, created_at desc
),
steps as (
  select worker_id,
    jsonb_object_agg(k, jsonb_build_object(
      'status', status,
      'requested_to', coalesce(requested_to, ''),
      'requested_on', requested_on,
      'note', coalesce(note, '')
    )) as s
  from latest group by worker_id
)
update todos t
  set procedure_steps = steps.s, title = '住所・保険の手続き', note = ''
  from keep, steps
  where t.id = keep.id and keep.worker_id = steps.worker_id;

-- まとめた残り（手続きごとの古いTODO）は削除フォルダへ
update todos set deleted_at = now()
  where kind = '住所・保険の手続き' and deleted_at is null
    and title in ('転出手続き', '転入手続き', '国民健康保険の加入手続き', '国民年金の加入手続き');

-- まとめたTODOの経過を、中の手続きから決め直す
update todos set status = case
    when exists (select 1 from jsonb_each(procedure_steps) e where e.value->>'status' = '依頼中') then '依頼中'
    when exists (select 1 from jsonb_each(procedure_steps) e where e.value->>'status' = '未着手') then '未着手'
    when exists (select 1 from jsonb_each(procedure_steps) e where e.value->>'status' = '完了') then '完了'
    else 'キャンセル'
  end
  where kind = '住所・保険の手続き' and deleted_at is null and title = '住所・保険の手続き'
    and procedure_steps <> '{}'::jsonb;
