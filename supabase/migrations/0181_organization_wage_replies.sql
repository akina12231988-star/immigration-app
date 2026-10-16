-- 最低賃金の改定ごとの、所属機関からの「時給のご確認」への回答の記録。
--
-- 改定のたびに所属機関へ案内（FAX）を送り、改定後の時給を返事してもらっている。
-- どの機関にまだ送っていないか・どの機関から返事がまだかを一覧で管理し、
-- 返事のあった時給（1号・2号）を地域ごとに集計できるようにする。
-- 改定（適用日 effective_on）× 機関で1行。何度実行しても同じ結果になる。
create table if not exists organization_wage_replies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  effective_on    date not null,                 -- 改定後の最低賃金の適用日（回答の回を表す）
  status          text not null default '未送付'
                    check (status in ('未送付', '送付済', '回答あり', '対象外')),
  sent_on         date,                          -- 案内を送った日
  replied_on      date,                          -- 返事をもらった日
  hourly_ssw1     integer,                       -- 回答の時給（特定技能1号・円）。空は未回答
  hourly_ssw2     integer,                       -- 回答の時給（特定技能2号・円）。空は未回答
  note            text not null default '',
  created_by      uuid references profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, effective_on)
);

create index if not exists idx_organization_wage_replies_round
  on organization_wage_replies (effective_on, organization_id);

alter table organization_wage_replies enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff（worker_wages と同じ方針）
drop policy if exists sel_organization_wage_replies on organization_wage_replies;
create policy sel_organization_wage_replies on organization_wage_replies for select
  using (my_role() is not null);
drop policy if exists ins_organization_wage_replies on organization_wage_replies;
create policy ins_organization_wage_replies on organization_wage_replies for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_organization_wage_replies on organization_wage_replies;
create policy upd_organization_wage_replies on organization_wage_replies for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_organization_wage_replies on organization_wage_replies;
create policy del_organization_wage_replies on organization_wage_replies for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists organization_wage_replies_updated on organization_wage_replies;
create trigger organization_wage_replies_updated before update on organization_wage_replies
  for each row execute procedure moddatetime(updated_at);
