-- 入管メール通知（Gmailに届いた入管からの許可/申請受付メールをアプリ内で可視化）用テーブル（追加のみ）
-- Gmail → Google Apps Script → /api/mail/inbound（service_role）でこのテーブルに登録される。

create table if not exists mail_notifications (
  id                      uuid primary key default gen_random_uuid(),
  gmail_message_id        text unique,                       -- Gmailメッセージの内部ID（重複登録の防止）
  category                text not null default 'その他',   -- 許可 / 申請受付 / その他
  subject                 text not null default '',          -- 件名
  from_address            text not null default '',          -- 差出人
  snippet                 text not null default '',          -- 抜粋
  body                    text not null default '',          -- 本文（プレーン、先頭のみ）
  received_at             timestamptz not null default now(),-- 受信日時
  gmail_link              text not null default '',          -- Gmailで開くリンク
  matched_worker_id       uuid references workers(id) on delete set null,                 -- 自動紐づけ: 外国人
  matched_application_id  uuid references immigration_applications(id) on delete set null,-- 自動紐づけ: 申請
  matched_name            text not null default '',          -- 本文から推定した氏名
  is_read                 boolean not null default false,    -- 既読フラグ
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_mail_notifications_received on mail_notifications (received_at desc);
create index if not exists idx_mail_notifications_unread on mail_notifications (is_read) where is_read = false;

alter table mail_notifications enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新・削除: admin・staff（Webhookは service_role でRLSをバイパス）
create policy sel_mail_notifications on mail_notifications for select using (my_role() is not null);
create policy ins_mail_notifications on mail_notifications for insert with check (my_role() in ('admin', 'staff'));
create policy upd_mail_notifications on mail_notifications for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_mail_notifications on mail_notifications for delete using (my_role() in ('admin', 'staff'));

create trigger mail_notifications_updated before update on mail_notifications
  for each row execute procedure moddatetime(updated_at);
