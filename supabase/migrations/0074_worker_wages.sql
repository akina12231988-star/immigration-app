-- 外国人の賃金（時給・月給など）の記録。
--
-- これまで賃金は求人（job_postings）にしか無く、その求人の条件でしかなかったため、
-- 「その人がいくらで採用されたか」「昇給していくら変わったか」を残せなかった。
-- 昇給のたびに1行増やし、適用開始日がいちばん新しい行を現在の賃金として扱う。
-- 転職しても機関ごとに残るよう、所属機関も持たせる。
create table if not exists worker_wages (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  organization_id uuid references organizations (id) on delete set null, -- どの機関での賃金か
  kind            text not null default '時給'
                    check (kind in ('時給', '月給', '日給', '年収')),
  amount          integer not null default 0,  -- 金額（円）
  started_on      date not null,               -- この賃金の適用開始日（採用日・昇給日）
  reason          text not null default '',    -- 採用時 / 昇給 など
  note            text not null default '',
  created_by      uuid references profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 現在の賃金は「その人の中で適用開始日がいちばん新しい行」なので、この並びで引く
create index if not exists idx_worker_wages_worker
  on worker_wages (worker_id, started_on desc);
create index if not exists idx_worker_wages_org on worker_wages (organization_id);

alter table worker_wages enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff（sales_entries と同じ方針）
create policy sel_worker_wages on worker_wages for select
  using (my_role() is not null);
create policy ins_worker_wages on worker_wages for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_worker_wages on worker_wages for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_worker_wages on worker_wages for delete
  using (my_role() in ('admin', 'staff'));

create trigger worker_wages_updated before update on worker_wages
  for each row execute procedure moddatetime(updated_at);
