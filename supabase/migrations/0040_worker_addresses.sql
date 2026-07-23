-- 外国人の住所歴（転入日ごとの住所）。課税・納税証明書の「1月1日時点の住所」判定に使う。
create table if not exists worker_addresses (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references workers (id) on delete cascade,
  moved_on   date not null,                 -- 転入（居住開始）日
  address    text not null default '',
  kind       text not null default '',      -- 国内転入 / 転入 / 転居 など（自由記入）
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_worker_addresses on worker_addresses (worker_id, moved_on desc);

alter table worker_addresses enable row level security;

create policy sel_worker_addresses on worker_addresses for select
  using (my_role() is not null);
create policy ins_worker_addresses on worker_addresses for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_worker_addresses on worker_addresses for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_worker_addresses on worker_addresses for delete
  using (my_role() in ('admin', 'staff'));
