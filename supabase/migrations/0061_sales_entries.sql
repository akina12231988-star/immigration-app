-- freee販売への売上登録の明細（第1段階: 登録漏れ防止のための「登録待ち」リスト）。
-- 在留カード受領後に、申請種別・特定技能総合保険・支援代の日割り・定期売上を組み立てて保存し、
-- freee販売に登録したら「登録済み」にして伝票番号を記録する。
create table if not exists sales_entries (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  organization_id uuid references organizations (id) on delete set null,
  application_id  uuid references immigration_applications (id) on delete set null,
  kind            text not null default '',          -- 申請 / 保険 / 支援代日割り / 定期売上 / 退職精算
  item_name       text not null default '',          -- 品目（特定技能申請・特定技能総合保険・特定技能支援代 など）
  description     text not null default '',          -- freeeに記載する内容
  amount          integer not null default 0,        -- 金額（円）
  taxable         boolean not null default true,     -- false = 非課税（特定技能総合保険）
  period_from     date,                              -- 対象期間（開始）
  period_to       date,                              -- 対象期間（終了。定期売上は退職時に締める）
  status          text not null default '未登録',     -- 未登録 / 登録済み / 対象外
  freee_no        text not null default '',          -- freee販売の伝票番号など
  registered_on   date,                              -- freeeに登録した日
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_sales_entries_status on sales_entries (status, created_at desc);
create index if not exists idx_sales_entries_worker on sales_entries (worker_id, created_at desc);

alter table sales_entries enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff
create policy sel_sales_entries on sales_entries for select
  using (my_role() is not null);
create policy ins_sales_entries on sales_entries for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_sales_entries on sales_entries for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_sales_entries on sales_entries for delete
  using (my_role() in ('admin', 'staff'));

create trigger sales_entries_updated before update on sales_entries
  for each row execute procedure moddatetime(updated_at);
