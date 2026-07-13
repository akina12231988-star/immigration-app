-- 入管申請管理を Supabase 化し、外国人（workers）と紐づける。
-- これまで localStorage 保存だった /applications のデータを全職員で共有し、
-- 外国人詳細画面から申請受付日・申請番号を参照できるようにする。

create type immigration_app_status as enum (
  '申請前', '申請済', 'LINE報告済', '通知書到着', '許可済'
);

create table immigration_applications (
  id                      uuid primary key default gen_random_uuid(),
  -- 外国人との紐づけ（未登録の人の申請も受け付けるため null 可。削除時はリンクのみ外す）
  worker_id               uuid references workers (id) on delete set null,
  name                    text not null check (length(name) between 1 and 100),
  application_date        date not null,
  application_no          text not null default '',
  content                 text not null default '',
  status                  immigration_app_status not null default '申請前',
  assignee                text not null default '',
  line_reported           boolean not null default false,
  notion_synced           boolean not null default false,
  approved                boolean not null default false,
  approval_date           date,
  receipt_image_url       text,
  notice_image_url        text,
  residence_card_image_url text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_imm_apps_worker on immigration_applications (worker_id);
create index idx_imm_apps_no     on immigration_applications (application_no);
create index idx_imm_apps_status on immigration_applications (status);
create index idx_imm_apps_date   on immigration_applications (application_date desc);

create trigger immigration_applications_updated before update on immigration_applications
  for each row execute procedure moddatetime(updated_at);

-- RLS: 他テーブルと同じ方針（select は全ロール、書き込みは admin/staff）
alter table immigration_applications enable row level security;

create policy sel_imm_apps on immigration_applications for select
  using (my_role() is not null);
create policy ins_imm_apps on immigration_applications for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_imm_apps on immigration_applications for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_imm_apps on immigration_applications for delete
  using (my_role() in ('admin', 'staff'));

-- テーブル権限は 0007 の alter default privileges により authenticated へ自動付与済み
