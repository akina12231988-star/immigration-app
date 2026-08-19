-- 退職＜随時報告＞の進み具合（準備中 → 署名依頼中 → 投函完了）を記録する。
--
-- 届出書を作成（ダウンロード）したら「署名依頼中」、
-- 署名済みの届出書をスキャンして添付し、レターパックの追跡番号と投函日を
-- 入れたら「投函完了」になる。
--
-- 何度実行しても安全。
alter table resignations
  add column if not exists status text not null default '準備中',
  add column if not exists forms_downloaded_at timestamptz,
  add column if not exists posted_on date,
  add column if not exists tracking_no text not null default '';

alter table resignations drop constraint if exists resignations_status_check;
alter table resignations add constraint resignations_status_check
  check (status in ('準備中', '署名依頼中', '投函完了'));

comment on column resignations.status is '進み具合（準備中／署名依頼中／投函完了）';
comment on column resignations.forms_downloaded_at is '届出書の様式を最初にダウンロードした日時';
comment on column resignations.posted_on is 'レターパックで投函した日';
comment on column resignations.tracking_no is 'レターパックの追跡番号';

create index if not exists idx_resignations_status on resignations (status, leaving_on desc);

-- 署名済みの届出書（スキャンしたPDF・画像）。1件の退職記録に複数登録できる
create table if not exists resignation_files (
  id             uuid primary key default gen_random_uuid(),
  resignation_id uuid not null references resignations (id) on delete cascade,
  storage_path   text not null,
  file_name      text not null,
  mime_type      text not null,
  uploaded_by    uuid references profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists idx_resignation_files
  on resignation_files (resignation_id, created_at);

alter table resignation_files enable row level security;
drop policy if exists sel_resignation_files on resignation_files;
drop policy if exists ins_resignation_files on resignation_files;
drop policy if exists del_resignation_files on resignation_files;
create policy sel_resignation_files on resignation_files for select using (my_role() is not null);
create policy ins_resignation_files on resignation_files for insert
  with check (my_role() in ('admin', 'staff'));
create policy del_resignation_files on resignation_files for delete
  using (my_role() in ('admin', 'staff'));
