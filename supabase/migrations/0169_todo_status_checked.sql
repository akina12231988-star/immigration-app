-- 申請準備のTODOのステータスに「チェック済み修正してください」「チェック済み　スキャンしてください」を足す。
-- 並びは「〇〇　チェック中」のすぐ下（TODO一覧の設定画面から足すと進行中のいちばん下に入るため、ここで位置を決める）。
-- 何度流しても同じ結果になるよう、すでにあるときは何もしない。

-- 「〜チェック中」のいちばん下の並び順より後ろを2つずつ下げる（まだ足していないときだけ）
update todo_status_options
set sort_no = sort_no + 2
where kind = '申請準備'
  and stage = '進行中'
  and sort_no > (
    select coalesce(max(sort_no), 0) from todo_status_options
    where kind = '申請準備' and stage = '進行中' and name like '%チェック中'
  )
  and not exists (
    select 1 from todo_status_options where kind = '申請準備' and name = 'チェック済み修正してください'
  );

insert into todo_status_options (kind, stage, name, sort_no)
select '申請準備', '進行中', 'チェック済み修正してください', coalesce(max(sort_no), 0) + 1
from todo_status_options
where kind = '申請準備' and stage = '進行中' and name like '%チェック中'
on conflict (kind, name) do nothing;

insert into todo_status_options (kind, stage, name, sort_no)
select '申請準備', '進行中', 'チェック済み　スキャンしてください', coalesce(max(sort_no), 0) + 2
from todo_status_options
where kind = '申請準備' and stage = '進行中' and name like '%チェック中'
on conflict (kind, name) do nothing;
