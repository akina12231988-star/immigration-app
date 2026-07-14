-- 業務システム拡張（docs/05_expansion_plan.md Phase B）。
-- すべて add column / create table のみ。既存データは削除しない。

-- ⑦ 外国人: 顔写真・Messengerリンク
alter table workers
  add column if not exists photo_path     text,
  add column if not exists messenger_link text not null default '';

-- ③⑤ 申請: 追加項目
alter table immigration_applications
  add column if not exists residence_expiry_at_apply date,          -- 申請時点の在留期限
  add column if not exists is_self_apply             boolean not null default false, -- 本人申請
  add column if not exists receipt_scheduled_on      date,          -- 受取予定日
  add column if not exists receipt_reason            text not null default '', -- 受取理由
  add column if not exists granted_card_no           text not null default '', -- 許可時 在留カード番号
  add column if not exists granted_permit_date       date,          -- 在留許可日
  add column if not exists granted_expiry_date       date,          -- 在留期限日
  add column if not exists employment_start_on       date,          -- 雇用開始日
  add column if not exists report_org_honorific      text not null default '御中'
    check (report_org_honorific in ('御中', '様'));

-- ⑥ 生活オリエンテーション（特定技能1号対象。資料はDrive等のリンクで管理）
create table if not exists orientations (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  organization_id uuid references organizations (id) on delete set null,
  application_id  uuid references immigration_applications (id) on delete set null,
  scheduled_on    date not null,                          -- 雇用開始日+2週後の日曜
  status          text not null default '未実施' check (status in ('未実施', '実施済')),
  done_on         date,                                   -- 実施日
  drive_link      text not null default '',               -- 資料の保存先リンク
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_orientations_worker on orientations (worker_id);
create index if not exists idx_orientations_status on orientations (status);
create index if not exists idx_orientations_sched  on orientations (scheduled_on);

drop trigger if exists orientations_updated on orientations;
create trigger orientations_updated before update on orientations
  for each row execute procedure moddatetime(updated_at);

alter table orientations enable row level security;

drop policy if exists sel_orientations on orientations;
drop policy if exists ins_orientations on orientations;
drop policy if exists upd_orientations on orientations;
drop policy if exists del_orientations on orientations;

create policy sel_orientations on orientations for select
  using (my_role() is not null);
create policy ins_orientations on orientations for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_orientations on orientations for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_orientations on orientations for delete
  using (my_role() in ('admin', 'staff'));

-- テーブル権限は 0007/0011 の default privileges により authenticated / service_role へ自動付与される
