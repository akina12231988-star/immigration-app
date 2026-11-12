-- 入管メール通知の「申請ごとの一覧表」で、手で直した状態とメモ。
-- 表そのものはメール（mail_notifications）から毎回組み立てるので、ここには手で入れたものだけを持つ。
-- key は申請受付仮番号（無ければ受付番号を官署番号にそろえたもの、無ければ在留カード番号）。
-- 何度実行しても安全（if not exists / drop policy if exists）。
create table if not exists mail_table_overrides (
  key        text primary key,
  status     text not null default '',
  memo       text not null default '',
  updated_at timestamptz not null default now()
);

alter table mail_table_overrides enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新: admin・staff / 削除: admin
drop policy if exists sel_mail_table_overrides on mail_table_overrides;
drop policy if exists ins_mail_table_overrides on mail_table_overrides;
drop policy if exists upd_mail_table_overrides on mail_table_overrides;
drop policy if exists del_mail_table_overrides on mail_table_overrides;
create policy sel_mail_table_overrides on mail_table_overrides for select using (my_role() is not null);
create policy ins_mail_table_overrides on mail_table_overrides for insert with check (my_role() in ('admin', 'staff'));
create policy upd_mail_table_overrides on mail_table_overrides for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_mail_table_overrides on mail_table_overrides for delete using (my_role() = 'admin');

drop trigger if exists mail_table_overrides_updated on mail_table_overrides;
create trigger mail_table_overrides_updated before update on mail_table_overrides
  for each row execute procedure moddatetime(updated_at);

notify pgrst, 'reload schema';
