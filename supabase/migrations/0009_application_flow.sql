-- 申請フロー拡張:
-- ① 在留カード受領ステータスの追加（許可済 → 在留カード受領 で完了）
-- ② 申請画像（受付票・通知書・在留カード〔複数枚〕）のメタデータテーブル
-- ③ 窓口申請 / オンライン申請の区分とオンライン申請のメールリンク

alter type immigration_app_status add value if not exists '在留カード受領';

alter table immigration_applications
  add column method            text not null default '窓口'
    check (method in ('窓口', 'オンライン')),
  add column email_link        text not null default '',
  add column card_received_on  date,
  add column approval_reported boolean not null default false;

-- 実体は Storage（非公開バケット app-files）。この表はメタデータのみ
create table application_files (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references immigration_applications (id) on delete cascade,
  kind           text not null check (kind in ('受付票', '通知書', '在留カード', 'その他')),
  storage_path   text not null,
  file_name      text not null,
  mime_type      text not null,
  uploaded_by    uuid references profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);

create index idx_app_files_application on application_files (application_id, kind);

alter table application_files enable row level security;

create policy sel_app_files on application_files for select
  using (my_role() is not null);
create policy ins_app_files on application_files for insert
  with check (my_role() in ('admin', 'staff'));
create policy del_app_files on application_files for delete
  using (my_role() in ('admin', 'staff'));

-- テーブル権限は 0007 の alter default privileges により authenticated へ自動付与済み
