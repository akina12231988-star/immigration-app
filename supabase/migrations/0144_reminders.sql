-- 督促（外国人への連絡と返事の進捗管理）。
--
-- 外国人に届いた市役所からの通知や領収書などを本人に知らせ、連絡したか・返事があったか・
-- 手続きが完了したかを追いかける。Messengerグループの会話はスクショ（画像）を貼り付けて残す。
--
-- 番号は保管ボックスと同じ考え方で、1〜30番を保管ボックスのように使う。
-- 完了すると番号が空きになり、次の人に同じ番号を割り当てられる。
-- 30番まで全部使っているときだけ31番以降を割り当てる（番号の決め方は src/lib/reminders.ts）。
--
-- 何度実行しても安全（if not exists / drop ... if exists）。

create table if not exists reminders (
  id            uuid primary key default gen_random_uuid(),
  reminder_no   integer not null check (reminder_no >= 1),
  worker_id     uuid not null references workers(id) on delete cascade,
  kind          text not null default '',   -- 種類（市役所からの通知 / 領収書 / その他）
  content       text not null default '',   -- 内容（何を知らせるか・何をしてもらうか）
  -- 進捗: 未連絡 / 連絡済み（返事待ち） / 返事あり / 完了
  status        text not null default '未連絡'
                check (status in ('未連絡', '連絡済み（返事待ち）', '返事あり', '完了')),
  contacted_on  date,                       -- 本人に連絡した日
  replied_on    date,                       -- 返事があった日
  completed_on  date,                       -- 完了した日
  note          text not null default '',   -- メモ（返事の内容・引き継ぎ）
  created_by    uuid references profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 完了以外（＝進行中）の中では番号は一意（完了すると空き番号になる）
create unique index if not exists idx_reminders_active_no
  on reminders (reminder_no) where status <> '完了';
create index if not exists idx_reminders_worker on reminders (worker_id, created_at desc);

-- 会話のスクショ（画像）。実体は app-files バケット（reminders/{reminder_id}/...）に置く
create table if not exists reminder_images (
  id            uuid primary key default gen_random_uuid(),
  reminder_id   uuid not null references reminders(id) on delete cascade,
  storage_path  text not null,
  file_name     text not null default '',
  mime_type     text not null default '',
  caption       text not null default '',   -- 画像の説明（例: 9/7 連絡・9/8 返事）
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_reminder_images_reminder
  on reminder_images (reminder_id, created_at asc);

alter table reminders enable row level security;
alter table reminder_images enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff
drop policy if exists sel_reminders on reminders;
create policy sel_reminders on reminders for select using (my_role() is not null);
drop policy if exists ins_reminders on reminders;
create policy ins_reminders on reminders for insert with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_reminders on reminders;
create policy upd_reminders on reminders for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_reminders on reminders;
create policy del_reminders on reminders for delete using (my_role() in ('admin', 'staff'));

drop policy if exists sel_reminder_images on reminder_images;
create policy sel_reminder_images on reminder_images for select using (my_role() is not null);
drop policy if exists ins_reminder_images on reminder_images;
create policy ins_reminder_images on reminder_images for insert with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_reminder_images on reminder_images;
create policy upd_reminder_images on reminder_images for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_reminder_images on reminder_images;
create policy del_reminder_images on reminder_images for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists reminders_updated on reminders;
create trigger reminders_updated before update on reminders
  for each row execute procedure moddatetime(updated_at);
