-- 所属機関からの書類の依頼（年末調整の書類など）の管理。
--
-- 会社から「扶養控除申告書・送金証明書を集めてほしい」のようなメールが来たとき、
-- その機関の在籍者ひとりひとりについて、
--   案内した（本人に伝えた）→ 発行した（書類を用意した）→ 会社に送った
-- をチェックできるようにする。依頼1件に書類の項目（jsonb）を持ち、
-- 外国人 × 項目で1行のチェックを記録する。何度実行しても同じ結果になる。

create table if not exists organization_document_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  title           text not null,                       -- 件名（例: 年末調整の件）
  requested_on    date not null default current_date,  -- 依頼が来た日
  due_on          date,                                -- 期限（例: 11月9日まで）
  source          text not null default '',            -- どうやって来たか（メール / 電話 / FAX など）
  memo            text not null default '',            -- メールの本文・補足
  -- 集める書類の項目。[{ id, name, note }] の配列
  -- （name: 扶養控除申告書 / note: コピーでよい・2026年入社の方のみ など）
  items           jsonb not null default '[]'::jsonb,
  closed_on       date,                                -- 対応が終わった日（空なら対応中）
  created_by      uuid references profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_organization_document_requests_org
  on organization_document_requests (organization_id, requested_on desc);

-- 外国人 × 項目のチェック。日付が入っていれば済み
create table if not exists organization_document_request_checks (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references organization_document_requests (id) on delete cascade,
  worker_id    uuid not null references workers (id) on delete cascade,
  item_id      text not null,                 -- 依頼の items の id
  informed_on  date,                          -- 本人に案内した日
  issued_on    date,                          -- 書類を発行（用意）した日
  sent_on      date,                          -- 会社に送った日
  not_needed   boolean not null default false, -- この人には要らない（対象外）
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (request_id, worker_id, item_id)
);

create index if not exists idx_organization_document_request_checks_request
  on organization_document_request_checks (request_id);

alter table organization_document_requests enable row level security;
alter table organization_document_request_checks enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff
drop policy if exists sel_organization_document_requests on organization_document_requests;
create policy sel_organization_document_requests on organization_document_requests for select
  using (my_role() is not null);
drop policy if exists ins_organization_document_requests on organization_document_requests;
create policy ins_organization_document_requests on organization_document_requests for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_organization_document_requests on organization_document_requests;
create policy upd_organization_document_requests on organization_document_requests for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_organization_document_requests on organization_document_requests;
create policy del_organization_document_requests on organization_document_requests for delete
  using (my_role() in ('admin', 'staff'));

drop policy if exists sel_organization_document_request_checks on organization_document_request_checks;
create policy sel_organization_document_request_checks on organization_document_request_checks for select
  using (my_role() is not null);
drop policy if exists ins_organization_document_request_checks on organization_document_request_checks;
create policy ins_organization_document_request_checks on organization_document_request_checks for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_organization_document_request_checks on organization_document_request_checks;
create policy upd_organization_document_request_checks on organization_document_request_checks for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_organization_document_request_checks on organization_document_request_checks;
create policy del_organization_document_request_checks on organization_document_request_checks for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists organization_document_requests_updated on organization_document_requests;
create trigger organization_document_requests_updated before update on organization_document_requests
  for each row execute procedure moddatetime(updated_at);
drop trigger if exists organization_document_request_checks_updated on organization_document_request_checks;
create trigger organization_document_request_checks_updated before update on organization_document_request_checks
  for each row execute procedure moddatetime(updated_at);
