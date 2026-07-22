-- パスポート・在留カード原本の預かり管理（追加のみ）
-- 預かり証の保管番号（001〜999）＝パスポートの付箋に貼る番号 を共通キーにする。
-- azk-receipt（預かり証発行ツール）のブラウザ台帳を置き換え、出し入れの履歴を永続化する。

-- 預かりレコード（1回の預かり＝1行。返却済みになると保管番号を再利用できる）
create table if not exists custody_records (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers(id) on delete cascade,
  storage_no   integer not null check (storage_no between 1 and 999),
  -- 預かり状況: ボックス保管中 / 持出中 / 返却済み（本人へ返却）
  status       text not null default 'ボックス保管中'
               check (status in ('ボックス保管中', '持出中', '返却済み')),
  items        text not null default 'パスポート・在留カード', -- 預かっている書類
  received_on  date not null default current_date,             -- 預かった日
  expire_on    date,                                           -- 預かり証の有効年月日
  content      text not null default '',                       -- 申請内容
  ref_no       text not null default '',                       -- 預かり証の整理番号
  holder       text not null default '',                       -- 持出中の場合: 今持っている人
  held_since   timestamptz,                                    -- 持出中の場合: 持出日時
  returned_on  date,                                           -- 本人へ返却した日
  note         text not null default '',
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 返却済み以外（＝現に預かり中）の中では保管番号は一意
create unique index if not exists idx_custody_active_no
  on custody_records (storage_no) where status <> '返却済み';
create index if not exists idx_custody_worker on custody_records (worker_id);

-- 出し入れの履歴（追記のみ。編集不可・削除は admin のみ）
create table if not exists custody_events (
  id           uuid primary key default gen_random_uuid(),
  custody_id   uuid not null references custody_records(id) on delete cascade,
  -- 預かり（発行） / 持出 / ボックスへ戻す / 本人へ返却
  action       text not null check (action in ('預かり', '持出', 'ボックスへ戻す', '本人へ返却')),
  person       text not null default '',  -- 持ち出した人・対応した担当者
  purpose      text not null default '',  -- 目的・メモ
  happened_at  timestamptz not null default now(),
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_custody_events_custody
  on custody_events (custody_id, happened_at desc);

alter table custody_records enable row level security;
alter table custody_events  enable row level security;

-- custody_records: 閲覧は全ロール、追加・更新は admin/staff、削除は admin のみ
create policy sel_custody on custody_records for select using (my_role() is not null);
create policy ins_custody on custody_records for insert with check (my_role() in ('admin', 'staff'));
create policy upd_custody on custody_records for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_custody on custody_records for delete using (my_role() = 'admin');

-- custody_events: 履歴が消えないよう update ポリシーは設けない（削除は admin のみ）
create policy sel_custody_events on custody_events for select using (my_role() is not null);
create policy ins_custody_events on custody_events for insert with check (my_role() in ('admin', 'staff'));
create policy del_custody_events on custody_events for delete using (my_role() = 'admin');

create trigger custody_records_updated before update on custody_records
  for each row execute procedure moddatetime(updated_at);
