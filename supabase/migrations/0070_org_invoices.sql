-- 所属機関ごとの請求・入金の記録（督促状のもとになる台帳）。
-- 月ごとに「実際に請求した金額・請求書番号」を保存し、入金があったら
-- 入金済み額・入金日を記録する。残額がある請求は督促状の一覧に自動で載り、
-- 記録は翌月以降もどんどん積み上がっていく。
create table if not exists org_invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  month           text not null,               -- 対象の年月 YYYY-MM
  billed_on       date,                        -- 請求日（通常は月初）
  invoice_no      text not null default '',    -- 請求書番号（freeeのINV-…）
  amount          integer not null default 0,  -- 請求金額（実際に請求した額）
  paid            integer not null default 0,  -- 入金済み額（全額入金なら請求金額と同額）
  paid_on         date,                        -- 入金日
  due_on          date,                        -- 支払期限（通常は月末）
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, month)
);
create index if not exists idx_org_invoices_org on org_invoices (organization_id, month desc);

alter table org_invoices enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff（sales_entries と同じ）
create policy sel_org_invoices on org_invoices for select
  using (my_role() is not null);
create policy ins_org_invoices on org_invoices for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_org_invoices on org_invoices for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_org_invoices on org_invoices for delete
  using (my_role() in ('admin', 'staff'));

create trigger org_invoices_updated before update on org_invoices
  for each row execute procedure moddatetime(updated_at);
