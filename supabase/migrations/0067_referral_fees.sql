-- 人材紹介（あっせん）手数料の台帳（紹介手数料台帳ページ）。
-- 全所属機関のあっせん手数料をまとめて管理し、請求年月日・入金年月日を記録する。
-- 氏名・在留許可日・在留資格は workers から表示する（worker_name は削除時の控え）。
create table if not exists referral_fees (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid references workers (id) on delete set null,
  organization_id uuid references organizations (id) on delete set null,
  worker_name     text not null default '',   -- 氏名（外国人が削除されても台帳に残すための控え）
  domestic        text not null default '国内', -- 国内・国外
  jobseeker_no    text not null default '',   -- 求職受付番号（例: R8KS-2）
  employer_name   text not null default '',   -- 求人者（求職簿）
  referred_on     date,                       -- 紹介年月日
  hired_on        date,                       -- 採用年月日
  fee             integer not null default 0, -- 手数料（円・税抜）
  sales_no        text not null default '',   -- 紹介売上No.（freee販売）
  billed_on       date,                       -- 請求年月日
  paid_on         date,                       -- 入金年月日
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_referral_fees_worker on referral_fees (worker_id);
create index if not exists idx_referral_fees_created on referral_fees (created_at desc);

alter table referral_fees enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff（sales_entries と同じ）
create policy sel_referral_fees on referral_fees for select
  using (my_role() is not null);
create policy ins_referral_fees on referral_fees for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_referral_fees on referral_fees for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_referral_fees on referral_fees for delete
  using (my_role() in ('admin', 'staff'));

create trigger referral_fees_updated before update on referral_fees
  for each row execute procedure moddatetime(updated_at);
