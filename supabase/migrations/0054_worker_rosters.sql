-- 会社へ送る労働者名簿。転職があるため外国人1人につき会社ごとに複数件保存できる。
-- 履歴・前職は行数が可変のため jsonb 配列で持つ。
create table if not exists worker_rosters (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid not null references workers (id) on delete cascade,
  company_name   text not null default '',            -- 送付先の会社名（名簿の識別に使う）
  work_kind      text not null default '',            -- 業務の種類（例: 耕種農業の一般社員（役員なし））
  history        jsonb not null default '[]'::jsonb,  -- 履歴 [{on, content}]（表示文字列のまま保存）
  previous_jobs  jsonb not null default '[]'::jsonb,  -- 前職 [{company, prefecture}]
  leaving_on     text not null default '',            -- 解雇・退職または死亡の年月日（表示文字列）
  leaving_reason text not null default '',            -- 同・事由
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_worker_rosters_worker on worker_rosters (worker_id, created_at);

alter table worker_rosters enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff
create policy sel_worker_rosters on worker_rosters for select
  using (my_role() is not null);
create policy ins_worker_rosters on worker_rosters for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_worker_rosters on worker_rosters for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_worker_rosters on worker_rosters for delete
  using (my_role() in ('admin', 'staff'));

create trigger worker_rosters_updated before update on worker_rosters
  for each row execute procedure moddatetime(updated_at);
