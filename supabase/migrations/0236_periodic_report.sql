-- 定期報告書（参考様式第3-6号）のための賃金台帳の入力。
--
-- 会社ごとに賃金台帳の項目（基本給・皆勤手当・寮費控除など）の名前と並びが違うので、
-- 機関ごとに項目を一度だけ登録し（org_payroll_items）、届いた賃金台帳を見ながら
-- 人×月で金額を転記する（periodic_report_entries）。項目には「3-6号のどの欄に
-- 集計するか」（category）を付けておき、平均値の算出はアプリ側で行う。
--
-- org_payroll_items … 機関ごとの賃金台帳の項目（翌年も引き継いで使う）
--   name       … 賃金台帳に書いてある項目名（例: 皆勤手当・寮費）
--   category   … 3-6号のどの欄に入れるか（src/types/db.ts の PAYROLL_ITEM_CATEGORIES）
--                 基本給など / 超過労働給与 / 通勤手当 / 精皆勤手当 / 家族手当 / 賞与など /
--                 控除 食費 / 控除 居住費 / 控除 税・社会保険料 / 控除 その他 / 集計しない
--   sort_order … 並び順（賃金台帳と同じ並びにして転記しやすくする）
--
-- periodic_report_entries … 人×月の実績1件（賃金台帳1か月分）
--   ym             … 対象の月（'2025-04' の形。年度は月から割り出す）
--   work_days      … 実労働日数（有給・休業日は含めない）
--   total_hours    … 実労働時間数（所定内＝実労働時間−超過はアプリ側で計算）
--   overtime_hours … 超過実労働時間数（早出・残業・休日労働など）
--   amounts        … 項目ごとの金額 { "<org_payroll_items.id>": 数値 }
--   excluded       … 月の途中の入社・退職などで、平均の計算から除く月は true
--   note           … メモ（画面だけで使う）
-- 何度実行しても安全。

create table if not exists org_payroll_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null default '',
  category        text not null default '基本給など',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists org_payroll_items_org on org_payroll_items (organization_id, sort_order);

alter table org_payroll_items enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新・削除: admin・staff
drop policy if exists sel_org_payroll_items on org_payroll_items;
drop policy if exists ins_org_payroll_items on org_payroll_items;
drop policy if exists upd_org_payroll_items on org_payroll_items;
drop policy if exists del_org_payroll_items on org_payroll_items;
create policy sel_org_payroll_items on org_payroll_items for select using (my_role() is not null);
create policy ins_org_payroll_items on org_payroll_items for insert with check (my_role() in ('admin', 'staff'));
create policy upd_org_payroll_items on org_payroll_items for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_org_payroll_items on org_payroll_items for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists org_payroll_items_updated on org_payroll_items;
create trigger org_payroll_items_updated before update on org_payroll_items
  for each row execute procedure moddatetime(updated_at);

create table if not exists periodic_report_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  worker_id       uuid not null references workers (id) on delete cascade,
  ym              text not null,
  work_days       numeric,
  total_hours     numeric,
  overtime_hours  numeric,
  amounts         jsonb not null default '{}'::jsonb,
  excluded        boolean not null default false,
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, worker_id, ym)
);

create index if not exists periodic_report_entries_org_ym on periodic_report_entries (organization_id, ym);
create index if not exists periodic_report_entries_worker on periodic_report_entries (worker_id, ym);

alter table periodic_report_entries enable row level security;

drop policy if exists sel_periodic_report_entries on periodic_report_entries;
drop policy if exists ins_periodic_report_entries on periodic_report_entries;
drop policy if exists upd_periodic_report_entries on periodic_report_entries;
drop policy if exists del_periodic_report_entries on periodic_report_entries;
create policy sel_periodic_report_entries on periodic_report_entries for select using (my_role() is not null);
create policy ins_periodic_report_entries on periodic_report_entries for insert with check (my_role() in ('admin', 'staff'));
create policy upd_periodic_report_entries on periodic_report_entries for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_periodic_report_entries on periodic_report_entries for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists periodic_report_entries_updated on periodic_report_entries;
create trigger periodic_report_entries_updated before update on periodic_report_entries
  for each row execute procedure moddatetime(updated_at);

notify pgrst, 'reload schema';
