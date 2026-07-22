-- 入社書類メール（所属機関へ入社書類を送るメールの作成・書類管理）
-- 旧スタンドアロンHTMLツール「入社書類メール生成ツール」をアプリ内に移植する。
-- 書類ファイルは app-files バケット（onboarding-docs/{worker_id}/...）に保存し、
-- 外国人詳細ページからも選択ダウンロードできるようにメタデータを持つ。

-- 外国人1人につき1件のメール作成情報（宛先・雇用条件・Gmailリンクなど）
create table if not exists onboarding_records (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null unique references workers(id) on delete cascade,
  org_name      text not null default '',            -- 宛名（所属機関名）
  org_honorific text not null default '御中'
                check (org_honorific in ('御中', '様')),
  employment_start_on date,                          -- 雇用開始年月日
  permit_on     date,                                -- 在留許可日
  office        text not null default '',            -- 配属先営業所
  residence     text not null default '',            -- 居住地（社宅 など）
  sender        text not null default '',            -- 送信者名
  extra_note    text not null default '',            -- 追記事項
  gmail_link    text not null default '',            -- 最初に送ったGmailのメールリンク
  mail_sent_on  date,                                -- 最初にメールを送った日
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 書類ごとのステータス・後送期日・アップロードファイル（外国人×書類キーで1行）
create table if not exists onboarding_documents (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references workers(id) on delete cascade,
  doc_key       text not null,                       -- zairyu / shiteisho など（lib/onboarding.ts）
  label         text not null default '',            -- 表示名（保存時点のスナップショット）
  sort_no       integer not null default 0,          -- メール本文での番号
  -- 添付資料 / 後送 / 未入手 / 対象外
  status        text not null default '添付'
                check (status in ('添付', '後送', '未入手', '対象外')),
  note          text not null default '',            -- 備考（メール本文に「→備考」で載る）
  due_on        date,                                -- 後送の場合: いつまでに送るか
  received_on   date,                                -- 後送の場合: 本人が送ってきた日（アラート解除）
  storage_path  text not null default '',            -- app-files バケット内のパス
  file_name     text not null default '',
  mime_type     text not null default '',
  uploaded_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (worker_id, doc_key)
);
create index if not exists idx_onboarding_docs_worker on onboarding_documents (worker_id, sort_no);
-- 後送アラート用: 後送のまま未受領の書類を素早く引く
create index if not exists idx_onboarding_docs_pending
  on onboarding_documents (status, due_on) where status = '後送' and received_on is null;

alter table onboarding_records   enable row level security;
alter table onboarding_documents enable row level security;

-- 閲覧は全ロール、追加・更新は admin/staff、削除は admin のみ（custody と同じ方針）
create policy sel_onboarding on onboarding_records for select using (my_role() is not null);
create policy ins_onboarding on onboarding_records for insert with check (my_role() in ('admin', 'staff'));
create policy upd_onboarding on onboarding_records for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_onboarding on onboarding_records for delete using (my_role() = 'admin');

create policy sel_onboarding_docs on onboarding_documents for select using (my_role() is not null);
create policy ins_onboarding_docs on onboarding_documents for insert with check (my_role() in ('admin', 'staff'));
create policy upd_onboarding_docs on onboarding_documents for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_onboarding_docs on onboarding_documents for delete using (my_role() = 'admin');

create trigger onboarding_records_updated before update on onboarding_records
  for each row execute procedure moddatetime(updated_at);
create trigger onboarding_documents_updated before update on onboarding_documents
  for each row execute procedure moddatetime(updated_at);
