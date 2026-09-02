-- 契約内容変更の随時報告書（0133）にも、退職の記録（0086）と同じ
-- 進み具合（準備中 → 署名依頼中 → 投函完了）と、署名済み届出書の添付・投函の記録を持たせる。
-- 何度実行しても安全。
alter table contract_changes
  add column if not exists status text not null default '準備中',
  add column if not exists posted_on date,
  add column if not exists tracking_no text not null default '';

alter table contract_changes drop constraint if exists contract_changes_status_check;
alter table contract_changes add constraint contract_changes_status_check
  check (status in ('準備中', '署名依頼中', '投函完了'));

comment on column contract_changes.status is '進み具合（準備中／署名依頼中／投函完了）';
comment on column contract_changes.posted_on is 'レターパックで投函した日';
comment on column contract_changes.tracking_no is 'レターパックの追跡番号';

create index if not exists idx_contract_changes_status
  on contract_changes (status, changed_on desc);

-- 署名済みの届出書（スキャンしたPDF・画像）。1件の記録に複数登録できる
create table if not exists contract_change_files (
  id                 uuid primary key default gen_random_uuid(),
  contract_change_id uuid not null references contract_changes (id) on delete cascade,
  storage_path       text not null,
  file_name          text not null,
  mime_type          text not null,
  uploaded_by        uuid references profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now()
);
create index if not exists idx_contract_change_files
  on contract_change_files (contract_change_id, created_at);

alter table contract_change_files enable row level security;
drop policy if exists sel_contract_change_files on contract_change_files;
drop policy if exists ins_contract_change_files on contract_change_files;
drop policy if exists del_contract_change_files on contract_change_files;
create policy sel_contract_change_files on contract_change_files for select
  using (my_role() is not null);
create policy ins_contract_change_files on contract_change_files for insert
  with check (my_role() in ('admin', 'staff'));
create policy del_contract_change_files on contract_change_files for delete
  using (my_role() in ('admin', 'staff'));
