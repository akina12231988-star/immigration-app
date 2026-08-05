-- freee販売に「◯月分の支援代（サポート代）」を登録した記録（請求書作成のチェック用）。
-- 月末の請求書作成で、定期売上No.の横の「freee売上登録」ボタンを押すと
-- 外国人×対象の年月で記録し、登録漏れ・二重登録を防ぐ。
-- 名称は在留資格が特定活動なら「サポート代」、それ以外は「支援代」。
create table if not exists monthly_support_registrations (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references workers (id) on delete cascade,
  month         text not null,                     -- 対象の年月 YYYY-MM
  fee_name      text not null default '支援代',    -- 支援代（特定技能）/ サポート代（特定活動）
  registered_on date,                              -- 登録した日
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (worker_id, month)
);
create index if not exists idx_monthly_support_regs_month on monthly_support_registrations (month);

alter table monthly_support_registrations enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff（sales_entries と同じ）
create policy sel_monthly_support_regs on monthly_support_registrations for select
  using (my_role() is not null);
create policy ins_monthly_support_regs on monthly_support_registrations for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_monthly_support_regs on monthly_support_registrations for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_monthly_support_regs on monthly_support_registrations for delete
  using (my_role() in ('admin', 'staff'));

create trigger monthly_support_regs_updated before update on monthly_support_registrations
  for each row execute procedure moddatetime(updated_at);
