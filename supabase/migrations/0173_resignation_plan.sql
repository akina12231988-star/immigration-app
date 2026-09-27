-- 退職の記録に「退職予定」と「退職日の変更の記録（会社への報告）」を持たせる。
--
-- leaving_timing … 退職日の決め方（'' / 日付で決まっている / 許可が降りてから退職）。
--                  特定活動の人が「許可が降りてから退職したい」ときなど、日付が決まる前から記録できる
-- leaving_plan_note … 退職予定のメモ（例：特定技能の許可が降りたら退職したいとのこと）
-- leaving_date_changes … 退職日を変えるたびに1件ずつ残す記録
--   [{ "id", "from", "to", "changed_on", "reported": 会社に報告したか, "reported_on": 報告日,
--      "approval": '' / 了承済み / 了承待ち / 了承されなかった }]
-- 何度実行しても安全（if not exists）
alter table resignations
  add column if not exists leaving_timing text not null default '',
  add column if not exists leaving_plan_note text not null default '',
  add column if not exists leaving_date_changes jsonb not null default '[]'::jsonb;

comment on column resignations.leaving_timing is '退職日の決め方（日付で決まっている／許可が降りてから退職）';
comment on column resignations.leaving_plan_note is '退職予定のメモ';
comment on column resignations.leaving_date_changes is '退職日の変更の記録と、会社への報告（報告日・了承）';
