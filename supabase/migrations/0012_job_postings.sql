-- 求人管理簿（厚生労働省の求人管理簿の記載事項準拠）＋ Facebook掲載用項目。
-- 応募（job_applications）・採用（employments）と紐づける。docs/04_recruiting_design.md 参照。

create type posting_status as enum ('募集中', '充足', '終了');
create type wage_type as enum ('時給', '月給', '日給', '年収');
create type gender_req as enum ('不問', '男性', '女性');

create table job_postings (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations (id) on delete cascade,
  -- 厚労省 求人管理簿の記載事項
  received_on        date not null default current_date, -- 求人受付年月日
  valid_until        date,                               -- 有効期間
  closed_on          date,                               -- 無効となった年月日（充足・終了時）
  openings           int not null default 1 check (openings >= 1), -- 求人数
  job_type           text not null default '',           -- 職種
  work_location      text not null default '',           -- 就業場所
  employment_period  text not null default '',           -- 雇用期間
  wage_kind          wage_type not null default '時給',
  wage_amount        int,                                -- 賃金（単一額・円）
  contact            text not null default '',           -- 連絡先
  -- Facebook掲載用の表示項目
  display_company    text not null default '',           -- 掲載用会社名
  display_address    text not null default '',           -- 掲載用の簡易住所
  target_nationality text not null default '',           -- 対象国籍
  gender             gender_req not null default '不問',
  hire_timing        text not null default '',           -- 採用予定時期
  status             posting_status not null default '募集中',
  note               text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_postings_org    on job_postings (organization_id);
create index idx_postings_status on job_postings (status);

create trigger job_postings_updated before update on job_postings
  for each row execute procedure moddatetime(updated_at);

-- 応募↔求人、採用↔応募 の紐づけ
alter table job_applications
  add column job_posting_id uuid references job_postings (id) on delete set null;
alter table employments
  add column job_application_id uuid references job_applications (id) on delete set null;

create index idx_apps_posting        on job_applications (job_posting_id);
create index idx_employments_appfrom on employments (job_application_id);

-- RLS（既存テーブルと同方針: 閲覧=全ロール、書き込み=admin/staff）
alter table job_postings enable row level security;

create policy sel_postings on job_postings for select
  using (my_role() is not null);
create policy ins_postings on job_postings for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_postings on job_postings for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_postings on job_postings for delete
  using (my_role() in ('admin', 'staff'));

-- テーブル権限は 0007/0011 の default privileges により authenticated / service_role へ自動付与される
