-- 追加改修（バッチ2）。すべて add column / add value / create table のみ。既存データは削除しない。

-- ① 外国人の状態に「在籍中」を追加
alter type worker_status add value if not exists '在籍中';

-- ① 申請: 許可時の在留資格（特定技能1号なら生活オリエンテーション自動登録）
alter table immigration_applications
  add column if not exists visa_at_grant text not null default '';

-- ① 入管許可通知後のメモ（時系列履歴・在留カード受取まで残す）
create table if not exists application_memos (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references immigration_applications (id) on delete cascade,
  author         text not null default '',
  body           text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists idx_app_memos_app on application_memos (application_id, created_at);

alter table application_memos enable row level security;
drop policy if exists sel_app_memos on application_memos;
drop policy if exists ins_app_memos on application_memos;
drop policy if exists del_app_memos on application_memos;
create policy sel_app_memos on application_memos for select using (my_role() is not null);
create policy ins_app_memos on application_memos for insert with check (my_role() in ('admin', 'staff'));
create policy del_app_memos on application_memos for delete using (my_role() in ('admin', 'staff'));

-- ① 生活オリエンテーション一覧に雇用開始日を表示するため保持
alter table orientations
  add column if not exists employment_start_on date;

-- ④ 外国人 基本情報の追加項目
alter table workers
  add column if not exists specialty_grade      text not null default '', -- 専門級の合格名
  add column if not exists other_qualifications text not null default ''; -- その他の資格・合格名

-- ④ 在留カード・指定書の履歴管理（外国人管理から差し替え・履歴保持・最新表示）
create table if not exists worker_documents (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers (id) on delete cascade,
  kind         text not null check (kind in ('在留カード', '指定書')),
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  uploaded_by  uuid references profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_worker_docs on worker_documents (worker_id, kind, created_at desc);

alter table worker_documents enable row level security;
drop policy if exists sel_worker_docs on worker_documents;
drop policy if exists ins_worker_docs on worker_documents;
drop policy if exists del_worker_docs on worker_documents;
create policy sel_worker_docs on worker_documents for select using (my_role() is not null);
create policy ins_worker_docs on worker_documents for insert with check (my_role() in ('admin', 'staff'));
create policy del_worker_docs on worker_documents for delete using (my_role() in ('admin', 'staff'));
