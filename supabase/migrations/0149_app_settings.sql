-- アプリ全体の設定（キーと値）。
-- まずは登録支援機関の情報（key = 'support_org'。申請書「所属機関等作成用 4」に書く氏名・登録番号・住所など）を
-- 画面から編集して保存するために使う。値は jsonb で持ち、項目は画面側（src/lib/custody.ts）で決める。
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新: admin・staff / 削除: admin
drop policy if exists sel_app_settings on app_settings;
drop policy if exists ins_app_settings on app_settings;
drop policy if exists upd_app_settings on app_settings;
drop policy if exists del_app_settings on app_settings;
create policy sel_app_settings on app_settings for select using (my_role() is not null);
create policy ins_app_settings on app_settings for insert with check (my_role() in ('admin', 'staff'));
create policy upd_app_settings on app_settings for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_app_settings on app_settings for delete using (my_role() = 'admin');

drop trigger if exists app_settings_updated on app_settings;
create trigger app_settings_updated before update on app_settings
  for each row execute procedure moddatetime(updated_at);
