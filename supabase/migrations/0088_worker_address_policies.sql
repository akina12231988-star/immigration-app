-- 住所歴（worker_addresses）の削除ができない件の対策。
--
-- 外国人詳細の住所歴でゴミ箱を押しても消えない場合、削除の権限設定（RLSポリシー）が
-- 入っていないことがあります（0040 の適用が途中で止まっていた場合など）。
-- ここで4つのポリシーを作り直します。内容は 0040 と同じで、何度実行しても安全です。
alter table worker_addresses enable row level security;

drop policy if exists sel_worker_addresses on worker_addresses;
drop policy if exists ins_worker_addresses on worker_addresses;
drop policy if exists upd_worker_addresses on worker_addresses;
drop policy if exists del_worker_addresses on worker_addresses;

create policy sel_worker_addresses on worker_addresses for select
  using (my_role() is not null);
create policy ins_worker_addresses on worker_addresses for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_worker_addresses on worker_addresses for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_worker_addresses on worker_addresses for delete
  using (my_role() in ('admin', 'staff'));

-- 確認（4行返れば設定できています）
select policyname as ポリシー, cmd as 対象
from pg_policies
where tablename = 'worker_addresses'
order by cmd;
