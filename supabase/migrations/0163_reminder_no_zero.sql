-- 督促の番号の箱は「納付書が入っている人」のもの。
-- 納付書が無く（当社が代わりに全部払ってしまい）、本人からの返金を待つだけの督促は
-- 箱から出して番号を返し、「立替・本人からの支払い待ち」の一覧に載せる。
-- そのため reminder_no = 0 を「箱なし」として許し、番号の一意チェックは 1 以上だけにする。
-- 何度実行しても安全
alter table reminders drop constraint if exists reminders_reminder_no_check;
alter table reminders add constraint reminders_reminder_no_check check (reminder_no >= 0);

drop index if exists idx_reminders_active_no;
create unique index if not exists idx_reminders_active_no
  on reminders (reminder_no) where status <> '完了' and reminder_no > 0;

comment on column reminders.reminder_no is
  '番号の箱（1〜30。完了で空き）。0 は箱なし（当社が全部立て替えて納付書が無く、本人からの返金待ち）';
