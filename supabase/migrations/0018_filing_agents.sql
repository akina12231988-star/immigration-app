-- 申請取次士のマスタ。申請登録時にプルダウンで選択できるようにする。

create table if not exists filing_agents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_filing_agents_name on filing_agents (name);

alter table filing_agents enable row level security;
drop policy if exists sel_filing_agents on filing_agents;
drop policy if exists ins_filing_agents on filing_agents;
drop policy if exists upd_filing_agents on filing_agents;
drop policy if exists del_filing_agents on filing_agents;
create policy sel_filing_agents on filing_agents for select using (my_role() is not null);
create policy ins_filing_agents on filing_agents for insert with check (my_role() in ('admin', 'staff'));
create policy upd_filing_agents on filing_agents for update using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_filing_agents on filing_agents for delete using (my_role() in ('admin', 'staff'));
