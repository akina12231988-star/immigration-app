-- 出入国の記録（パスポートのスタンプの日付）。1行が1往復:
-- 母国出国日 → 日本入国日 → 日本出国日 → 母国入国日。
-- まだ日本にいる人は日本出国日・母国入国日を空のままにする。
-- 外国人詳細のパスポートの下で、回数と流れを図で表示するのに使う。
create table if not exists worker_travels (
  id                uuid primary key default gen_random_uuid(),
  worker_id         uuid not null references workers(id) on delete cascade,
  home_departure_on date,
  japan_entry_on    date,
  japan_exit_on     date,
  home_entry_on     date,
  note              text not null default '',
  created_at        timestamptz not null default now()
);
create index if not exists idx_worker_travels_worker
  on worker_travels (worker_id, japan_entry_on);

alter table worker_travels enable row level security;

drop policy if exists sel_worker_travels on worker_travels;
create policy sel_worker_travels on worker_travels for select
  using (my_role() is not null);
drop policy if exists ins_worker_travels on worker_travels;
create policy ins_worker_travels on worker_travels for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_worker_travels on worker_travels;
create policy upd_worker_travels on worker_travels for update
  using (my_role() in ('admin', 'staff'));
drop policy if exists del_worker_travels on worker_travels;
create policy del_worker_travels on worker_travels for delete
  using (my_role() in ('admin', 'staff'));
