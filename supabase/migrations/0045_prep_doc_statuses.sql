-- 申請準備 書類チェックリスト: 書類ごとの準備状況（ステータス）。
-- 各書類に「準備中／完了」の選択肢（書類ごとに内容が異なる）と、
-- 付随する入力（依頼先・金額・受診日・レターパック追跡番号・理由書メモ）を保存する。
-- 「申請後に入管へ郵送する」フラグは、申請後のアラート表示に使う。
create table if not exists prep_doc_statuses (
  id               uuid primary key default gen_random_uuid(),
  checklist_id     uuid not null references application_prep_checklists(id) on delete cascade,
  doc_id           text not null,                 -- PREP_DOC_DEFS の id（zairyu / kazei など）
  status           text not null default '',      -- 選択した準備状況（'' = 未選択）
  note             text not null default '',      -- 依頼先・理由書・メモなどの自由入力
  amount           text not null default '',      -- 金額（未納額・源泉徴収票の金額など）
  date_on          date,                          -- 受診日など
  tracking_out     text not null default '',      -- レターパック追跡番号（大使館へ送付）
  tracking_back    text not null default '',      -- レターパック追跡番号（返信用）
  mail_after_apply boolean not null default false, -- 申請後に発行され次第、入管へ郵送する
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (checklist_id, doc_id)
);

alter table prep_doc_statuses enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff（チェックリスト本体と同方針）
create policy sel_prep_doc_statuses on prep_doc_statuses for select
  using (my_role() is not null);
create policy ins_prep_doc_statuses on prep_doc_statuses for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_prep_doc_statuses on prep_doc_statuses for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_prep_doc_statuses on prep_doc_statuses for delete
  using (my_role() in ('admin', 'staff'));

create trigger prep_doc_statuses_updated before update on prep_doc_statuses
  for each row execute procedure moddatetime(updated_at);

-- 申請種別に「認定」（在留資格認定申請）を追加。
-- 必要書類は変更申請と同じ扱い＋推薦状（送り出し機関・大使館から取得）。
alter table application_prep_checklists
  drop constraint if exists application_prep_checklists_app_type_check;
alter table application_prep_checklists
  add constraint application_prep_checklists_app_type_check
  check (app_type in ('', '変更', '更新', '認定'));
